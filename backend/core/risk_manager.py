import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Tuple

from config import (
    MAX_DAILY_LOSS_PCT, MAX_WEEKLY_DRAWDOWN_PCT,
    MAX_CONSECUTIVE_LOSSES, COOLDOWN_MINUTES, MAX_LEVERAGE, DEFAULT_LEVERAGE,
)
import core.supabase_client as db

log = logging.getLogger("risk_manager")


class RiskManager:
    def __init__(self):
        self._cooldown_until: Optional[datetime] = None
        self._consecutive_losses: int = 0

    def sync_from_db(self, mode: str):
        self._consecutive_losses = db.count_consecutive_losses(mode)
        log.info(f"Risk sync: consecutive losses = {self._consecutive_losses}")

    def record_trade_result(self, pnl: float):
        if pnl < 0:
            self._consecutive_losses += 1
            if self._consecutive_losses >= MAX_CONSECUTIVE_LOSSES:
                self._cooldown_until = datetime.now(timezone.utc) + timedelta(minutes=COOLDOWN_MINUTES)
                log.warning(f"Circuit breaker: {MAX_CONSECUTIVE_LOSSES} losses → {COOLDOWN_MINUTES}min cooldown")
        else:
            self._consecutive_losses = 0

    def check(self, mode: str, wallet: Dict) -> Tuple[bool, str]:
        """Returns (allowed, reason). If not allowed, reason explains why."""

        # ── Cooldown check ───────────────────────────────────
        if self._cooldown_until:
            now = datetime.now(timezone.utc)
            if now < self._cooldown_until:
                remaining = int((self._cooldown_until - now).total_seconds() / 60)
                return False, f"Cooldown active: {remaining}min remaining after {MAX_CONSECUTIVE_LOSSES} losses"
            else:
                self._cooldown_until = None
                self._consecutive_losses = 0

        # ── Daily loss limit ─────────────────────────────────
        balance = wallet.get("balance", 0)
        initial = wallet.get("initial_balance", balance)
        daily_pnl = db.get_today_pnl(mode)
        daily_loss_pct = abs(daily_pnl) / initial * 100 if initial > 0 and daily_pnl < 0 else 0

        if daily_loss_pct >= MAX_DAILY_LOSS_PCT:
            return False, f"Daily loss limit hit: {daily_loss_pct:.2f}% (max {MAX_DAILY_LOSS_PCT}%)"

        # ── Weekly drawdown check ─────────────────────────────
        total_pnl     = wallet.get("total_pnl", 0)
        weekly_dd_pct = abs(total_pnl) / initial * 100 if initial > 0 and total_pnl < 0 else 0
        if weekly_dd_pct >= MAX_WEEKLY_DRAWDOWN_PCT:
            return False, f"Weekly drawdown limit: {weekly_dd_pct:.2f}% (max {MAX_WEEKLY_DRAWDOWN_PCT}%)"

        return True, "ok"

    def calculate_position(self, balance: float, capital_pct: float,
                           entry_price: float, atr_val: float,
                           sl_mult: float, user_leverage: float = DEFAULT_LEVERAGE) -> Dict:
        """
        Position Size = Balance × Capital% × Leverage
        User sets exactly how much to allocate and at what leverage.
        Risk/profit fully managed by trailing SL system.
        """
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
