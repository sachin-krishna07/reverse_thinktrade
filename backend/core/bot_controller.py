import asyncio
import logging
from typing import Callable, Dict, List, Optional, Set

from config import SCALPING, SWING, SIGNAL_BROADCAST_INTERVAL, MIN_SIGNAL_SCORE
from core.market_data import MarketDataManager
from core.signal_engine import SignalEngine
from core.risk_manager import RiskManager
from core.trade_engine import TradeEngine
import core.supabase_client as db

log = logging.getLogger("bot_controller")


class BotController:
    def __init__(self):
        self._running  = False
        self._md       = MarketDataManager()
        self._risk     = RiskManager()
        self._engine:  Optional[TradeEngine] = None
        self._signals: Optional[SignalEngine] = None

        self._mode:         str   = "demo"
        self._style:        str   = "scalping"
        self._pairs:        List[str] = []
        self._capital_pct:  float = 1.0
        self._leverage:     float = 5.0

        self._broadcast_cb: Optional[Callable] = None
        self._tasks:        List[asyncio.Task] = []

        # Last signal per pair (in-memory cache)
        self._last_signals: Dict[str, Dict] = {}

    # ─── Lifecycle ──────────────────────────────────────────

    async def start(self, mode: str, style: str, pairs: List[str],
                    capital_pct: float, broadcast_cb: Callable, leverage: float = 5.0):
        if self._running:
            log.warning("Bot already running")
            return

        self._mode        = mode
        self._style       = style
        self._pairs       = pairs
        self._capital_pct = capital_pct
        self._leverage    = leverage
        self._broadcast_cb = broadcast_cb
        self._running     = True

        log.info(f"Bot starting | mode={mode} style={style} pairs={pairs} capital={capital_pct}% leverage={leverage}x")

        # Update DB config
        db.update_bot_config(
            is_running=True, mode=mode, style=style,
            capital_pct=capital_pct, selected_pairs=pairs,
        )

        # Init trade engine
        self._engine = TradeEngine(
            risk=self._risk,
            on_update=self._broadcast,
            mode=mode,
            leverage=leverage,
        )
        self._engine.set_price_getter(self._md.get_price)
        self._engine.set_running(True)
        self._engine.load_wallet()

        # Fresh start — clear circuit breaker and per-pair SL cooldowns
        self._risk.reset()
        self._engine._sl_cooldown.clear()

        # Init signal engine
        self._signals = SignalEngine(self._md)

        # Start market data
        await self._md.start(pairs, style)

        # Launch main loop tasks
        self._tasks = [
            asyncio.create_task(self._signal_loop()),
            asyncio.create_task(self._wallet_broadcast_loop()),
            asyncio.create_task(self._price_ticker_loop()),
        ]

        await self._broadcast({"type": "bot_status", "data": {"running": True, "mode": mode, "style": style, "pairs": pairs}})
        log.info("Bot started")

    async def stop(self):
        if not self._running:
            return
        self._running = False
        self._engine.set_running(False)

        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

        await self._md.stop()
        db.update_bot_config(is_running=False)
        await self._broadcast({"type": "bot_status", "data": {"running": False}})
        log.info("Bot stopped")

    def is_running(self) -> bool:
        return self._running

    # ─── Signal Loop ────────────────────────────────────────

    async def _signal_loop(self):
        warm_up_scans = 0          # skip entries for first 2 scans after restart
        while self._running:
            try:
                await self._process_signals(allow_entry=warm_up_scans >= 2)
                if warm_up_scans < 2:
                    warm_up_scans += 1
                    log.info(f"Warm-up scan {warm_up_scans}/2 — entries paused (stale signal guard)")
                if warm_up_scans == 2:
                    # After warm-up, push snapshot so UI gets all signals at once
                    await self._broadcast({"type": "snapshot", "data": self.snapshot()})
            except Exception as e:
                log.error(f"Signal loop error: {e}", exc_info=True)
            await asyncio.sleep(SIGNAL_BROADCAST_INTERVAL)

    async def _process_signals(self, allow_entry: bool = True):
        if not self._pairs:
            return

        # Get BTC trend direction first — used as bias gate for all altcoins
        btc_direction = None
        if "BTC" in self._pairs:
            try:
                btc_result = self._signals.score("BTC", self._style)
                if btc_result.trend_regime == 1:
                    btc_direction = btc_result.trend_direction  # "long" or "short"
                # neutral/ranging → btc_direction stays None → gate skipped for altcoins
            except Exception as e:
                log.error(f"BTC pre-scan error: {e}", exc_info=True)

        entered_this_cycle = False   # max 1 new trade per scan cycle
        for pair in self._pairs:
            if not self._running:
                break
            try:
                bias = None if pair == "BTC" else btc_direction
                result = self._signals.score(pair, self._style, btc_direction=bias)

                # Upsert to Supabase only when score or direction changes — reduces DB writes
                prev = self._last_signals.get(pair, {})
                if (prev.get("total_score") != result.total_score or
                        prev.get("signal_direction") != result.signal_direction):
                    try:
                        db.upsert_signal(pair, result.to_dict())
                    except Exception as db_err:
                        log.debug(f"Signal upsert failed [{pair}]: {db_err}")

                self._last_signals[pair] = result.to_dict()

                # Broadcast to WebSocket clients — quality gate fields added separately (not in DB)
                await self._broadcast({
                    "type": "signal_update",
                    "data": {
                        "pair":         pair,
                        "price":        self._md.get_price(pair),
                        "trade_signal": result.trade_signal,
                        "btc_bias":     result.btc_bias,
                        **result.to_dict(),
                    }
                })

                # ── Check if trade should be entered ─────────────
                score        = result.total_score
                open_count   = self._engine.count_open_positions(pair)
                total_open   = self._engine.total_open_positions()

                can_enter = (
                    allow_entry
                    and result.trade_signal
                    and total_open < 3
                    and open_count == 0
                    and not entered_this_cycle   # max 1 trade per scan cycle
                )

                if can_enter:
                    log.info(f">>> TRADE SIGNAL: {pair} {result.signal_direction.upper()} "
                             f"score={score}/7 positions={open_count+1} price={self._md.get_price(pair)}")
                    task = asyncio.create_task(
                        self._engine.enter(pair, self._style, result, self._capital_pct, score)
                    )
                    task.add_done_callback(
                        lambda t: log.error(f"Enter task failed: {t.exception()}")
                        if not t.cancelled() and t.exception() else None
                    )
                    entered_this_cycle = True
            except Exception as e:
                log.error(f"Signal processing error [{pair}]: {e}", exc_info=True)

    # ─── Price Ticker ────────────────────────────────────────────

    async def _price_ticker_loop(self):
        """Broadcast live prices every 1s — separate from signal loop (which runs every 2s)."""
        while self._running:
            try:
                prices = {
                    pair: self._md.get_price(pair)
                    for pair in self._pairs
                    if self._md.get_price(pair) > 0
                }
                if prices:
                    await self._broadcast({"type": "price_update", "data": prices})
            except Exception as e:
                log.debug(f"Price ticker error: {e}")
            await asyncio.sleep(1)

    # ─── Wallet Broadcast ────────────────────────────────────

    async def _wallet_broadcast_loop(self):
        while self._running:
            try:
                wallet = self._engine.wallet_snapshot() if self._engine else {}
                await self._broadcast({
                    "type": "wallet_update",
                    "data": wallet,
                })
            except Exception as e:
                log.debug(f"Wallet broadcast error: {e}")
            await asyncio.sleep(5)

    # ─── Broadcast ──────────────────────────────────────────

    async def _broadcast(self, message: Dict):
        if self._broadcast_cb:
            try:
                await self._broadcast_cb(message)
            except Exception as e:
                log.debug(f"Broadcast error: {e}")

    # ─── Status / Snapshot ──────────────────────────────────

    def snapshot(self) -> Dict:
        wallet = self._engine.wallet_snapshot() if self._engine else {}
        return {
            "running":      self._running,
            "mode":         self._mode,
            "style":        self._style,
            "pairs":        self._pairs,
            "capital_pct":  self._capital_pct,
            "wallet":       wallet,
            "signals":      self._last_signals,
            "has_position": self._engine.has_open_position() if self._engine else False,
            "open_pairs":   list(self._engine._open.keys()) if self._engine else [],
        }

    async def force_close_current(self):
        if not self._engine:
            return
        for pair in list(self._engine._open.keys()):
            price = self._md.get_price(pair)
            if price > 0:
                await self._engine.force_close(pair, price)
