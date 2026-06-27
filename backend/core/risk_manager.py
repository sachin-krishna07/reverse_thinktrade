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

    def sync_from_db(self, mode: str):
        """On bot restart — check last 5 trades and set appropriate mode."""
        losses = db.count_losses_in_window(mode, LOSS_WINDOW)
        log.info(f"Risk sync: {losses}/{LOSS_WINDOW} losses in last {LOSS_WINDOW} trades")

        # Find highest applicable cooldown level
        triggered_level = None
        for i, (min_losses, _) in enumerate(COOLDOWN_LEVELS):
            if losses >= min_losses:
                triggered_level = i

        if triggered_level is not None:
            self._trade_mode    = MODE_RESTRICTED
            self._cooldown_level = triggered_level
            log.warning(
                f"Risk sync: {losses}/{LOSS_WINDOW} losses detected on restart "
                f"→ starting in RESTRICTED mode (1 trade max)"
            )
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

    def record_trade_result(self, pnl: float):
        """Called after every trade closes — update mode based on result."""
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

            if self._trade_mode == MODE_RESTRICTED:
                # Escalate to next cooldown level
                next_level   = min(self._cooldown_level + 1, len(COOLDOWN_LEVELS) - 1)
                minutes      = COOLDOWN_LEVELS[next_level][1]
                self._cooldown_level  = next_level
                self._cooldown_until  = now + timedelta(minutes=minutes)
                self._trade_mode      = MODE_COOLDOWN
                log.warning(
                    f"❌ LOSS in restricted mode → ESCALATED cooldown "
                    f"{minutes} min (level {next_level + 1}/{len(COOLDOWN_LEVELS)}). "
                    f"No trades until {self._cooldown_until.strftime('%H:%M:%S UTC')}"
                )
            elif self._trade_mode == MODE_SEMI:
                # Back to restricted — window check in check() will handle cooldown if needed
                log.warning("❌ Loss in semi-normal mode → back to RESTRICTED (1 trade). Window will be re-evaluated.")
                self._trade_mode = MODE_RESTRICTED

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
        if self._trade_mode in (MODE_NORMAL, MODE_SEMI):
            losses = db.count_losses_in_window(mode, LOSS_WINDOW)

            triggered_level = None
            for i, (min_losses, _) in enumerate(COOLDOWN_LEVELS):
                if losses >= min_losses:
                    triggered_level = i

            if triggered_level is not None:
                min_losses_hit, minutes = COOLDOWN_LEVELS[triggered_level]
                self._cooldown_level  = triggered_level
                self._cooldown_until  = now + timedelta(minutes=minutes)
                self._trade_mode      = MODE_COOLDOWN
                self._consecutive_wins = 0
                reason = (
                    f"🚫 {losses}/{LOSS_WINDOW} losses in last {LOSS_WINDOW} trades "
                    f"→ {minutes} min cooldown (level {triggered_level + 1}). "
                    f"No trades until {self._cooldown_until.strftime('%H:%M:%S UTC')}"
                )
                log.warning(reason)
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
        if self._trade_mode == MODE_COOLDOWN and self._cooldown_until:
            secs = int((self._cooldown_until - datetime.now(timezone.utc)).total_seconds())
            remaining = max(0, secs)
        return {
            "trade_mode":       self._trade_mode,
            "max_trades":       self.max_trades(),
            "cooldown_level":   self._cooldown_level,
            "cooldown_remaining_sec": remaining,
            "consecutive_wins": self._consecutive_wins,
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
