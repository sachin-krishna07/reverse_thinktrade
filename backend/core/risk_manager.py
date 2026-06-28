import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Tuple

from config import (
    MAX_DAILY_LOSS_PCT, MAX_WEEKLY_DRAWDOWN_PCT,
    LOSS_WINDOW, COOLDOWN_LEVELS,
    MAX_TRADES_NORMAL, MAX_TRADES_SEMI, MAX_TRADES_RESTRICTED,
    MAX_LEVERAGE, DEFAULT_LEVERAGE,
)
import core.supabase_client as db

log = logging.getLogger("risk_manager")

# Trade modes
MODE_NORMAL     = "normal"      # 3 trades, no restriction
MODE_SEMI       = "semi_normal" # 2 trades, recovering
MODE_RESTRICTED = "restricted"  # 1 trade, just came out of cooldown
MODE_COOLDOWN   = "cooldown"    # 0 trades, band hai


class RiskManager:
    def __init__(self):
        self._trade_mode: str              = MODE_NORMAL
        self._cooldown_until: Optional[datetime] = None
        self._cooldown_level: int          = 0   # index into COOLDOWN_LEVELS
        self._consecutive_wins: int        = 0   # wins in semi_normal mode

    def _evaluate_window_cooldown(self, mode: str, anchor: Optional[datetime] = None) -> bool:
        """Check the loss window and start the cooldown anchored to the triggering
        loss's CLOSE time — not to `now`.

        anchor: explicit countdown start time. If None, the close time of the most
        recent loss in the window is used (read from the DB). This makes the
        countdown reflect real elapsed time since the loss closed, so:
          • a loss that closed 10 min ago shows 20 min remaining (not a fresh 30),
          • losses whose cooldown window already elapsed (e.g. yesterday's trades)
            do NOT spawn a fresh countdown.

        Returns True if a cooldown is currently active (mode set to COOLDOWN).
        """
        losses, latest_loss_exit = db.get_loss_window_info(mode, LOSS_WINDOW)

        triggered_level = None
        for i, (min_losses, _) in enumerate(COOLDOWN_LEVELS):
            if losses >= min_losses:
                triggered_level = i

        if triggered_level is None:
            return False

        minutes        = COOLDOWN_LEVELS[triggered_level][1]
        now            = datetime.now(timezone.utc)
        start          = anchor or latest_loss_exit or now
        cooldown_until = start + timedelta(minutes=minutes)

        self._cooldown_level   = triggered_level
        self._consecutive_wins = 0

        if now < cooldown_until:
            self._cooldown_until = cooldown_until
            self._trade_mode     = MODE_COOLDOWN
            remaining_min = int((cooldown_until - now).total_seconds()) // 60
            log.warning(
                f"🚫 {losses}/{LOSS_WINDOW} losses → {minutes} min cooldown "
                f"(level {triggered_level + 1}). Started {start.strftime('%H:%M:%S UTC')}, "
                f"{remaining_min} min left, until {cooldown_until.strftime('%H:%M:%S UTC')}"
            )
            return True

        # Triggering loss closed long enough ago that the cooldown has already
        # elapsed (e.g. trades from a previous day) → treat it as served.
        self._cooldown_until = None
        self._trade_mode     = MODE_RESTRICTED
        log.info(
            f"{losses}/{LOSS_WINDOW} losses in window but triggering loss closed "
            f">{minutes} min ago → cooldown already served, RESTRICTED mode (1 trade)."
        )
        return False

    def sync_from_db(self, mode: str):
        """On bot restart — re-evaluate the loss window and restore the correct mode.

        The cooldown (if any) is anchored to the last loss's close time, so a
        restart resumes the *remaining* countdown rather than starting a fresh one.
        """
        if self._evaluate_window_cooldown(mode):
            log.warning("Risk sync: active cooldown restored from DB (anchored to last loss close)")
        elif self._trade_mode == MODE_RESTRICTED:
            log.warning("Risk sync: recent loss cluster → RESTRICTED mode (1 trade max)")
        else:
            self._trade_mode = MODE_NORMAL
            log.info("Risk sync: loss window normal → NORMAL mode (3 trades)")

    def reset(self):
        """Fresh start — clear all state on bot restart."""
        self._trade_mode      = MODE_NORMAL
        self._cooldown_until  = None
        self._cooldown_level  = 0
        self._consecutive_wins = 0
        log.info("Risk manager reset — fresh start")

    def record_trade_result(self, pnl: float, mode: str):
        """Called after every trade closes — update mode based on result.

        `mode` is the bot's trading mode (used to scope the loss-window query).
        On a loss this fires the moment the trade closes, so the cooldown
        countdown starts at close time — not when the next signal arrives.
        """
        now = datetime.now(timezone.utc)

        if pnl >= 0:
            # ── WIN ──────────────────────────────────────────────
            if self._trade_mode == MODE_RESTRICTED:
                self._trade_mode      = MODE_SEMI
                self._consecutive_wins = 1
                log.warning(
                    "✅ WIN in restricted mode → SEMI-NORMAL mode (2 trades allowed). "
                    "Need 1 more consecutive win to return to normal."
                )
            elif self._trade_mode == MODE_SEMI:
                self._consecutive_wins += 1
                if self._consecutive_wins >= 2:
                    self._trade_mode      = MODE_NORMAL
                    self._cooldown_level  = 0
                    self._consecutive_wins = 0
                    log.warning("✅✅ 2 consecutive wins → back to NORMAL mode (3 trades allowed)")
                else:
                    log.info(
                        f"✅ Win in semi-normal mode ({self._consecutive_wins}/2 wins). "
                        f"1 more win needed for full normal."
                    )
            else:
                # Normal mode win — nothing to change
                self._consecutive_wins = 0

        else:
            # ── LOSS ─────────────────────────────────────────────
            self._consecutive_wins = 0

            # Har loss ke baad (RESTRICTED / SEMI / NORMAL) — window se decide karo.
            # 3/5 losses → 30 min, 4/5 → 60 min, 5/5 → 120 min.
            # Escalation hataya: cooldown hamesha actual window pe based hoga.
            if self._trade_mode == MODE_SEMI:
                log.warning("❌ Loss in semi-normal mode → evaluating window for cooldown.")
                self._trade_mode = MODE_RESTRICTED
            self._evaluate_window_cooldown(mode, anchor=now)

    def check(self, mode: str, wallet: Dict) -> Tuple[bool, str]:
        """Returns (allowed, reason). Called before every trade entry."""
        now = datetime.now(timezone.utc)

        # ── 1. Active cooldown check ─────────────────────────────
        if self._trade_mode == MODE_COOLDOWN:
            if self._cooldown_until and now < self._cooldown_until:
                remaining_sec = int((self._cooldown_until - now).total_seconds())
                remaining_min = remaining_sec // 60
                remaining_s   = remaining_sec % 60
                reason = (
                    f"🚫 Cooldown active: {remaining_min}m {remaining_s}s remaining "
                    f"(level {self._cooldown_level + 1}/{len(COOLDOWN_LEVELS)})"
                )
                log.info(reason)
                return False, reason
            else:
                # Cooldown expired → restricted mode
                self._cooldown_until = None
                self._trade_mode     = MODE_RESTRICTED
                log.warning(
                    "⏰ Cooldown expired → RESTRICTED mode (1 trade allowed). "
                    "Win = semi-normal, Loss = escalated cooldown."
                )

        # ── 2. Window-based loss check (normal + semi_normal) ────
        # Anchored to the triggering loss's close time (anchor=None → DB lookup),
        # so the countdown reflects real elapsed time and stale losses don't
        # spawn a fresh cooldown.
        if self._trade_mode in (MODE_NORMAL, MODE_SEMI):
            if self._evaluate_window_cooldown(mode):
                remaining_sec = int((self._cooldown_until - now).total_seconds())
                reason = (
                    f"🚫 Cooldown active: {remaining_sec // 60}m {remaining_sec % 60}s remaining "
                    f"(level {self._cooldown_level + 1}/{len(COOLDOWN_LEVELS)})"
                )
                return False, reason

        # ── 3. Daily loss limit ──────────────────────────────────
        balance  = wallet.get("balance", 0)
        initial  = wallet.get("initial_balance", balance)
        daily_pnl = db.get_today_pnl(mode)
        daily_loss_pct = abs(daily_pnl) / initial * 100 if initial > 0 and daily_pnl < 0 else 0

        if daily_loss_pct >= MAX_DAILY_LOSS_PCT:
            return False, f"Daily loss limit hit: {daily_loss_pct:.2f}% (max {MAX_DAILY_LOSS_PCT}%)"

        # ── 4. Weekly drawdown check ─────────────────────────────
        total_pnl    = wallet.get("total_pnl", 0)
        weekly_dd_pct = abs(total_pnl) / initial * 100 if initial > 0 and total_pnl < 0 else 0
        if weekly_dd_pct >= MAX_WEEKLY_DRAWDOWN_PCT:
            return False, f"Weekly drawdown limit: {weekly_dd_pct:.2f}% (max {MAX_WEEKLY_DRAWDOWN_PCT}%)"

        return True, "ok"

    def max_trades(self) -> int:
        """How many simultaneous trades are allowed in current mode."""
        # Cooldown expiry must be checked here — not just inside check().
        # check() runs inside enter(), which only fires when can_enter=True,
        # which requires max_trades()>0. Without this check here, the bot
        # stays permanently stuck in COOLDOWN even after the timer expires.
        if self._trade_mode == MODE_COOLDOWN:
            if self._cooldown_until and datetime.now(timezone.utc) >= self._cooldown_until:
                self._cooldown_until = None
                self._trade_mode     = MODE_RESTRICTED
                log.warning(
                    "⏰ Cooldown expired → RESTRICTED mode (1 trade allowed). "
                    "Win = semi-normal, Loss = escalated cooldown."
                )
            else:
                remaining = int((self._cooldown_until - datetime.now(timezone.utc)).total_seconds()) \
                            if self._cooldown_until else 0
                remaining_min = remaining // 60
                remaining_s   = remaining % 60
                log.debug(f"Cooldown active — {remaining_min}m {remaining_s}s remaining. No trades.")
                return 0

        if self._trade_mode == MODE_NORMAL:
            return MAX_TRADES_NORMAL      # 3
        if self._trade_mode == MODE_SEMI:
            return MAX_TRADES_SEMI        # 2
        if self._trade_mode == MODE_RESTRICTED:
            return MAX_TRADES_RESTRICTED  # 1
        return 0

    def status(self) -> Dict:
        """Snapshot for logging/broadcast."""
        remaining = None
        total_min = None
        if self._trade_mode == MODE_COOLDOWN and self._cooldown_until:
            secs = int((self._cooldown_until - datetime.now(timezone.utc)).total_seconds())
            remaining = max(0, secs)
            if self._cooldown_level < len(COOLDOWN_LEVELS):
                total_min = COOLDOWN_LEVELS[self._cooldown_level][1]
        return {
            "trade_mode":             self._trade_mode,
            "max_trades":             self.max_trades(),
            "cooldown_level":         self._cooldown_level,
            "cooldown_remaining_sec": remaining,
            "cooldown_total_min":     total_min,
            "consecutive_wins":       self._consecutive_wins,
        }

    def calculate_position(self, balance: float, capital_pct: float,
                           entry_price: float, atr_val: float,
                           sl_mult: float, user_leverage: float = DEFAULT_LEVERAGE) -> Dict:
        leverage          = min(user_leverage, MAX_LEVERAGE)
        position_size_usd = balance * (capital_pct / 100) * leverage
        quantity          = position_size_usd / entry_price if entry_price > 0 else 0

        sl_distance     = atr_val * sl_mult
        sl_distance_pct = sl_distance / entry_price if entry_price > 0 else 0.005
        risk_amount     = position_size_usd * sl_distance_pct

        log.info(f"Position: {capital_pct}% × {leverage}x = ${position_size_usd:.2f} | SL risk ~${risk_amount:.2f}")

        return {
            "risk_amount":       round(risk_amount, 4),
            "position_size_usd": round(position_size_usd, 4),
            "quantity":          round(quantity, 6),
            "leverage":          round(leverage, 2),
            "sl_distance":       round(sl_distance, 6),
            "sl_distance_pct":   round(sl_distance_pct, 6),
        }
