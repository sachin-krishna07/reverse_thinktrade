import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Any

from config import SCALPING, SWING, POSITION_CHECK_INTERVAL
from core.signal_engine import SignalResult
from core.risk_manager import RiskManager
import core.supabase_client as db

log = logging.getLogger("trade_engine")

# Delta Exchange futures taker fee (0.05%) + 18% GST = 0.059% per order
# Entry + Exit = 0.118% of position size total per trade
TAKER_FEE_RATE = 0.05 / 100 * 1.18   # 0.000590


class TradeEngine:
    def __init__(self, risk: RiskManager, on_update: Callable, mode: str = "demo", leverage: float = 5.0, trader_name: str = "Unknown"):
        self.risk        = risk
        self.on_update   = on_update
        self.mode        = mode
        self.leverage    = leverage
        self.trader_name = trader_name

        # Safe defaults — overwritten by bot_controller before use
        self._running   = False
        self._get_price = lambda pair: 0.0

        # Per-pair open positions: pair -> List of {trade_id, position_id, pos, monitor_task}
        # Allows max 2 positions per pair (4-signal + 5-signal pyramid)
        self._open: Dict[str, List] = {}

        # Per-pair SL cooldown: pair -> timestamp of last SL/trailing hit
        # Prevents re-entry on same coin for 20 min after SL
        self._sl_cooldown: Dict[str, float] = {}
        self._sl_cooldown_secs: int = 20 * 60  # 20 minutes

        self._initial_balance: float = 10000
        self._balance:         float = 10000
        self._total_pnl:       float = 0
        self._daily_pnl:       float = 0

    # ─── Init ────────────────────────────────────────────────

    def load_wallet(self):
        w = db.get_wallet(self.mode)
        self._balance         = w.get("balance", 10000)
        self._initial_balance = w.get("initial_balance", 10000)
        self._total_pnl       = w.get("total_pnl", 0)
        # Recalculate daily_pnl fresh from today's IST trades — ignore stale DB value
        self._daily_pnl       = db.get_today_pnl(self.mode)
        log.info(f"Wallet loaded: ${self._balance:.2f} ({self.mode})")

    # ─── Enter Trade ────────────────────────────────────────

    async def enter(self, pair: str, style: str,
                    signal: SignalResult, capital_pct: float,
                    signal_score: int = 4) -> bool:
        try:
            return await self._enter_inner(pair, style, signal, capital_pct, signal_score)
        except Exception as e:
            log.error(f"ENTER FAILED [{pair}]: {e}", exc_info=True)
            return False

    async def _enter_inner(self, pair: str, style: str,
                           signal: SignalResult, capital_pct: float,
                           signal_score: int = 4) -> bool:
        cfg = SCALPING if style == "scalping" else SWING

        log.info(f"Attempting entry: {pair} | score={signal.total_score} | dir={signal.signal_direction}")

        # Per-pair SL cooldown check
        if pair in self._sl_cooldown:
            elapsed = time.time() - self._sl_cooldown[pair]
            remaining = self._sl_cooldown_secs - elapsed
            if remaining > 0:
                log.info(f"{pair}: blocked by SL cooldown — {int(remaining/60)}m {int(remaining%60)}s remaining")
                return False

        wallet = await asyncio.to_thread(db.get_wallet, self.mode)
        if not wallet:
            log.error(f"Wallet not found for mode={self.mode} — run supabase_schema.sql in Supabase SQL Editor!")
            return False

        allowed, reason = self.risk.check(self.mode, wallet)
        if not allowed:
            log.info(f"Trade blocked — {reason}")
            return False

        entry_price = signal.current_price
        if entry_price <= 0:
            log.warning(f"Entry blocked — price is 0 for {pair}")
            return False

        sizing = self.risk.calculate_position(
            self._balance, capital_pct,
            entry_price, signal.atr_value, cfg["atr_sl_mult"],
            user_leverage=self.leverage
        )

        direction = signal.signal_direction
        sl_dist   = sizing["sl_distance"]
        tp_dist   = sl_dist * (cfg["atr_tp_mult"] / cfg["atr_sl_mult"])

        if direction == "long":
            sl_price = entry_price - sl_dist
            tp_price = entry_price + tp_dist
        else:
            sl_price = entry_price + sl_dist
            tp_price = entry_price - tp_dist

        # Entry fee (taker 0.05% + 18% GST) on position size
        entry_fee    = sizing["position_size_usd"] * TAKER_FEE_RATE
        total_fee_est = entry_fee * 2  # entry + exit

        # Gate: risk must be at least 3× total fee
        if sizing["risk_amount"] < total_fee_est * 3.0:
            log.info(f"{pair}: skipped — risk ₹{sizing['risk_amount']:.1f} too small vs fee ₹{total_fee_est:.1f}")
            return False

        trade_data = {
            "mode":              self.mode,
            "pair":              pair,
            "direction":         direction,
            "style":             style,
            "entry_price":       entry_price,
            "quantity":          sizing["quantity"],
            "position_size_usd": sizing["position_size_usd"],
            "leverage":          sizing["leverage"],
            "risk_amount":       sizing["risk_amount"],
            "sl_price":          sl_price,
            "tp_price":          tp_price,
            "capital_pct":       capital_pct,
            "status":            "open",
            "signals_at_entry":  signal.to_dict(),
            "fee":               round(entry_fee, 4),
            "signal_score":      signal_score,
            "trader_name":       self.trader_name,
        }

        trade_id = await asyncio.to_thread(db.open_trade, trade_data)
        if not trade_id:
            log.error("Failed to insert trade into Supabase — check table exists & RLS disabled")
            return False

        pos_data = {
            "trade_id":          trade_id,
            "pair":              pair,
            "direction":         direction,
            "entry_price":       entry_price,
            "current_price":     entry_price,
            "quantity":          sizing["quantity"],
            "position_size_usd": sizing["position_size_usd"],
            "sl_price":          sl_price,
            "tp_price":          tp_price,
            "sl_pct":            sizing["sl_distance_pct"] * 100,
            "tp_pct":            (tp_dist / entry_price) * 100,
            "trailing_sl":       None,
            "status":            "active",
        }

        pos_id = await asyncio.to_thread(db.open_position, pos_data)

        pos_snapshot = {**trade_data, **pos_data, "id": pos_id}
        monitor_task = asyncio.create_task(
            self._monitor_position(pair, style, cfg, trade_id, pos_id, pos_snapshot)
        )
        entry = {
            "trade_id":    trade_id,
            "position_id": pos_id,
            "pos":         pos_snapshot,
            "monitor_task": monitor_task,
        }
        if pair not in self._open:
            self._open[pair] = []
        self._open[pair].append(entry)

        log.info(f"TRADE OPENED: {direction.upper()} {pair} @ {entry_price:.4f} | "
                 f"SL:{sl_price:.4f} TP:{tp_price:.4f} | ${sizing['risk_amount']:.2f} risk")

        await self.on_update({
            "type": "trade_opened",
            "data": {
                "pair":      pair,
                "direction": direction,
                "entry":     entry_price,
                "sl":        sl_price,
                "tp":        tp_price,
                "size_usd":  sizing["position_size_usd"],
                "risk_usd":  sizing["risk_amount"],
            }
        })
        return True

    # ─── Position Monitor ────────────────────────────────────

    async def _monitor_position(self, pair: str, style: str, cfg: Dict,
                                trade_id: str, position_id: str, pos_snapshot: Dict):
        entry_price  = pos_snapshot["entry_price"]
        direction    = pos_snapshot["direction"]
        sl_price     = pos_snapshot["sl_price"]
        tp_price     = pos_snapshot["tp_price"]
        pos_size_usd = pos_snapshot["position_size_usd"]
        risk_amount  = pos_snapshot["risk_amount"]
        entry_time   = datetime.now(timezone.utc)

        initial_sl_dist = abs(entry_price - sl_price)
        highest_pnl    = 0.0
        trail_step     = 0        # index of next TRAIL_STEPS to check
        profit_locked  = False    # True once any profit is locked (0.3R+)
        trailing_sl    = sl_price

        # (trigger_R, lock_R): when price hits trigger_R → SL moves to lock_R
        # Trailing starts at 1R — below 1R original SL holds.
        # Steps get tighter as price goes higher — locks more profit on the way up.
        # Hard exit at 4R (see below).
        TRAIL_STEPS = [
            (0.70, 0.00),   # 0.7R → breakeven (SL moves to entry)
            (1.20, 0.90),   # 1.2R → lock 0.90R  (gap: 0.30R)
            (1.50, 1.20),   # 1.5R → lock 1.20R  (gap: 0.30R)
            (2.00, 1.70),   # 2.0R → lock 1.70R  (gap: 0.30R)
            (2.40, 2.00),   # 2.4R → lock 2.00R  (gap: 0.40R)
            (2.70, 2.50),   # 2.7R → lock 2.50R  (gap: 0.20R)
        ]

        r_price = lambda n: (
            entry_price + n * (risk_amount / pos_size_usd) * entry_price
            if direction == "long"
            else entry_price - n * (risk_amount / pos_size_usd) * entry_price
        )

        while pair in self._open and self._open[pair] and self._running:
            await asyncio.sleep(POSITION_CHECK_INTERVAL)

            current_price = self._get_price(pair)
            if current_price <= 0:
                continue

            elapsed = (datetime.now(timezone.utc) - entry_time).total_seconds()
            _ = elapsed  # tracked for UI display only, not used for exit

            # ── PnL calculation ──────────────────────────────
            if direction == "long":
                pnl_pct = (current_price - entry_price) / entry_price
            else:
                pnl_pct = (entry_price - current_price) / entry_price

            pnl = pnl_pct * pos_size_usd
            highest_pnl = max(highest_pnl, pnl)

            # ── Trailing SL logic ────────────────────────────
            r_current = pnl / risk_amount if risk_amount > 0 else 0

            # Process all pending trail steps in order
            while trail_step < len(TRAIL_STEPS):
                trigger_r, lock_r = TRAIL_STEPS[trail_step]
                if r_current >= trigger_r:
                    new_sl = r_price(lock_r)
                    if (direction == "long"  and new_sl > sl_price) or \
                       (direction == "short" and new_sl < sl_price):
                        sl_price    = new_sl
                        trailing_sl = sl_price
                        log.info(f"{pair} {trigger_r}R hit — SL → +{lock_r}R ({sl_price:.6f})")
                    if lock_r > 0:
                        profit_locked = True
                    trail_step += 1
                else:
                    break  # steps are ordered, no need to check further

            # Update position in DB (every 5 checks to reduce writes)
            breakeven_hit = trail_step > 0   # at least 0.3R step triggered
            if int(elapsed * 2) % 10 == 0:
                db.update_position(
                    position_id, current_price,
                    round(pnl, 4), round(pnl_pct * 100, 4),
                    round(highest_pnl, 4),
                    trailing_sl=round(trailing_sl, 6) if trailing_sl else None,
                    breakeven_hit=breakeven_hit,
                    lock_profit_hit=profit_locked,
                    sl_price=round(sl_price, 6),
                )

            await self.on_update({
                "type": "position_update",
                "data": {
                    "pair":          pair,
                    "direction":     direction,
                    "entry":         entry_price,
                    "current":       current_price,
                    "sl":            sl_price,
                    "tp":            tp_price,
                    "pnl":           round(pnl, 4),
                    "pnl_pct":       round(pnl_pct * 100, 4),
                    "r":             round(r_current, 3),
                    "highest_pnl":   round(highest_pnl, 4),
                    "breakeven_hit": breakeven_hit,
                    "profit_locked": profit_locked,
                    "trailing_sl":   round(trailing_sl, 6),
                    "elapsed_sec":   int(elapsed),
                    "size_usd":      round(pos_size_usd, 2),
                    "risk_usd":      round(risk_amount, 2),
                }
            })

            # ── Exit conditions ──────────────────────────────
            exit_reason = None

            # 4R → hard exit (profit booked)
            if r_current >= 4.0:
                exit_reason = "2r_target"
            # 1.5R hard max-loss — exit before original SL to cap slippage
            # Only applies before any trailing step has been triggered.
            elif r_current <= -0.9 and trail_step == 0:
                exit_reason = "max_loss"
            elif direction == "long":
                if current_price <= sl_price:
                    exit_reason = "sl" if trail_step == 0 else "trailing"
                elif current_price >= tp_price:
                    exit_reason = "tp"
            else:
                if current_price >= sl_price:
                    exit_reason = "sl" if trail_step == 0 else "trailing"
                elif current_price <= tp_price:
                    exit_reason = "tp"

            if exit_reason:
                # SL / breakeven / trailing → exit at sl_price (simulates real SL order).
                # max_loss → exit at exact -0.7R price level (simulates stop order, caps slippage).
                # TP and 2R target → exit at current_price (market fill, no fixed order).
                if exit_reason in ("sl", "breakeven", "trailing"):
                    exit_p = sl_price
                    if direction == "long":
                        exit_pct = (sl_price - entry_price) / entry_price
                    else:
                        exit_pct = (entry_price - sl_price) / entry_price
                    exit_pnl = exit_pct * pos_size_usd
                elif exit_reason == "max_loss":
                    # Exit at the -1.5R price level — not current price (avoids slippage)
                    exit_p = r_price(-1.5)
                    exit_pct = -1.5 * (risk_amount / pos_size_usd)
                    exit_pnl = -1.5 * risk_amount
                else:
                    # tp, 2r_target — exit at current market price
                    exit_p   = current_price
                    exit_pnl = pnl
                    exit_pct = pnl_pct

                await self._close_position(pair, trade_id, position_id, pos_snapshot,
                                           exit_p, exit_pnl, exit_pct, risk_amount,
                                           exit_reason, entry_time)
                return

    # ─── Close Position ──────────────────────────────────────

    async def _close_position(self, pair: str, trade_id: str, position_id: str,
                               pos_snapshot: Dict, exit_price: float, pnl: float,
                               pnl_pct: float, risk_amount: float, reason: str,
                               entry_time: Optional[datetime] = None):
        if pair not in self._open:
            return

        # Remove this specific trade from the list
        self._open[pair] = [e for e in self._open[pair] if e["trade_id"] != trade_id]
        if not self._open[pair]:
            del self._open[pair]

        # SL cooldown — set on sl, trailing, or max_loss exit to block re-entry for 20 min
        if reason in ("sl", "trailing", "max_loss"):
            self._sl_cooldown[pair] = time.time()
            log.info(f"{pair}: SL cooldown started — no re-entry for 20 min")

        r_multiple = pnl / risk_amount if risk_amount > 0 else 0
        duration   = int((datetime.now(timezone.utc) - entry_time).total_seconds()) if entry_time else 0

        # Fee: entry fee already stored — add exit fee here
        pos_size_usd = pos_snapshot.get("position_size_usd", 0)
        exit_fee     = pos_size_usd * TAKER_FEE_RATE
        entry_fee    = pos_snapshot.get("fee", pos_size_usd * TAKER_FEE_RATE)
        total_fee    = round(entry_fee + exit_fee, 4)
        net_pnl      = round(pnl - total_fee, 4)

        await asyncio.to_thread(
            db.close_trade, trade_id, exit_price,
            round(pnl, 4), round(pnl_pct * 100, 4),
            round(r_multiple, 4), reason, duration,
            total_fee, net_pnl
        )
        await asyncio.to_thread(db.close_position, position_id)

        # Wallet — always recalculate from DB to stay accurate
        self._total_pnl = await asyncio.to_thread(db.get_total_pnl, self.mode)
        self._daily_pnl = await asyncio.to_thread(db.get_today_pnl, self.mode)
        self._balance   = self._initial_balance + self._total_pnl
        await asyncio.to_thread(
            db.update_wallet, self.mode, self._balance,
            self._total_pnl, self._initial_balance, self._daily_pnl
        )
        await asyncio.to_thread(db.upsert_performance, self.mode)

        self.risk.record_trade_result(pnl)

        log.info(f"TRADE CLOSED: {pair} | {reason.upper()} | PnL=${pnl:.2f} ({pnl_pct*100:.2f}%) | R={r_multiple:.2f}")

        await self.on_update({
            "type": "trade_closed",
            "data": {
                "pair":      pair,
                "exit":      exit_price,
                "pnl":       round(pnl, 4),
                "pnl_pct":   round(pnl_pct * 100, 4),
                "r":         round(r_multiple, 4),
                "reason":    reason,
                "balance":   round(self._balance, 4),
                "total_pnl": round(self._total_pnl, 4),
            }
        })

    async def force_close(self, pair: str, price: float):
        entries = list(self._open.get(pair, []))  # copy to avoid mutation during iteration
        for entry in entries:
            pos          = entry["pos"]
            entry_price  = pos["entry_price"]
            direction    = pos["direction"]
            pos_size_usd = pos["position_size_usd"]
            risk_amount  = pos.get("risk_amount", 1)
            if direction == "long":
                pnl_pct = (price - entry_price) / entry_price
            else:
                pnl_pct = (entry_price - price) / entry_price
            pnl = pnl_pct * pos_size_usd
            await self._close_position(pair, entry["trade_id"], entry["position_id"],
                                       pos, price, pnl, pnl_pct, risk_amount, "manual", None)

    def set_price_getter(self, fn):
        self._get_price = fn

    def set_running(self, val: bool):
        self._running = val

    def has_open_position(self, pair: Optional[str] = None) -> bool:
        if pair:
            return pair in self._open and len(self._open[pair]) > 0
        return any(len(v) > 0 for v in self._open.values())

    def count_open_positions(self, pair: str) -> int:
        return len(self._open.get(pair, []))

    def total_open_positions(self) -> int:
        return sum(len(v) for v in self._open.values())

    def wallet_snapshot(self) -> Dict:
        return {
            "balance":         round(self._balance, 4),
            "initial_balance": round(self._initial_balance, 4),
            "total_pnl":       round(self._total_pnl, 4),
            "daily_pnl":       round(self._daily_pnl, 4),
            "total_pnl_pct":   round(self._total_pnl / self._initial_balance * 100, 4)
                               if self._initial_balance > 0 else 0,
        }

    def positions_snapshot(self) -> list:
        """Snapshot of all open positions — sent to reconnecting clients."""
        result = []
        for pair, entries in self._open.items():
            for e in entries:
                current      = self._get_price(pair)
                if current <= 0:
                    continue
                pos          = e.get("pos", {})
                direction    = pos.get("direction", "long")
                entry_price  = pos.get("entry_price", 0)
                sl_price     = pos.get("sl_price", 0)
                tp_price     = pos.get("tp_price", 0)
                pos_size_usd = pos.get("position_size_usd", 0)
                risk_amount  = pos.get("risk_amount", 1)

                if direction == "long":
                    pnl_pct = (current - entry_price) / entry_price
                else:
                    pnl_pct = (entry_price - current) / entry_price

                pnl       = pnl_pct * pos_size_usd
                r_current = pnl / risk_amount if risk_amount > 0 else 0

                result.append({
                    "pair":          pair,
                    "direction":     direction,
                    "entry":         entry_price,
                    "current":       current,
                    "sl":            sl_price,
                    "tp":            tp_price,
                    "pnl":           round(pnl, 4),
                    "pnl_pct":       round(pnl_pct * 100, 4),
                    "r":             round(r_current, 3),
                    "highest_pnl":   0,
                    "breakeven_hit": False,
                    "profit_locked": False,
                    "trailing_sl":   sl_price,
                    "elapsed_sec":   0,
                    "size_usd":      round(pos_size_usd, 2),
                    "risk_usd":      round(risk_amount, 2),
                })
        return result
