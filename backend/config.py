import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DEMO_INITIAL_BALANCE = float(os.getenv("DEMO_INITIAL_BALANCE", 10000))
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET_KEY = os.getenv("BINANCE_SECRET_KEY", "")

# ─── Pairs: display name → Binance symbol ───────────────────
# Rebuilt 2026-08-13 — full turnover. Every pair from the previous list was
# dropped (those coins now run on the other model) and replaced from a live
# Binance screen. The 2026-07-03 blocklist (SUI/NEAR/TON/OP/POL/HBAR/NOT/ARB)
# was retired at the same time: those coins are eligible again, but none of
# them cleared the volatility bar on this screen, so none are listed below.
#
# Screen: universe = symbols listed on BOTH spot and USDT-M perpetual (358 of
# 527 futures symbols qualify). Excluded everything on the old list, then
# gated on futures 24h vol >= $1.5M (fill depth), spot 24h vol >= $500k AND
# <= 8 empty 5m spot candles in 24h (the signal feed is spot — a gappy spot
# book means gappy indicators), and spread <= 0.08% (scalp cost). 76 pairs
# passed; these are the top 35 ranked by 5m ATR% — the entry TF the scalping
# strategy actually trades. Range: 2.57% (TUT) down to 0.39% (ENSO).
#
# Screen was run in a thin market: only 26 symbols in the whole usable
# universe traded over $50M/24h. Dropping the volume floor does NOT surface
# more volatile names — the $1.5-5M band topped out at 0.63% 5m ATR — so 35
# is roughly where quality runs out, not an arbitrary cut. Re-run monthly.
#
# NOTE: tried switching market data (market_data.py) to Binance FUTURES
# WebSocket so futures-only listings (no spot market — ~35 candidates:
# HYPE, FARTCOIN, XMR, RIVER, AIN, etc.) could be included too. Verified
# live via a demo bot run: futures WS connects and depth/bookTicker stream
# fine, but @kline_* and @aggTrade never deliver a single message (tested
# up to 65s, vs. instant on spot) — price stayed stuck at 0.0 the whole
# run, which would silently block every entry. Reverted market data to the
# spot feed (proven working) and dropped the 35 spot-less coins from this
# list rather than ship an unverified data path. Re-attempt only after
# confirming @kline_/@aggTrade actually deliver on futures from the
# production VPS, not just this dev machine.
# Sorted by 5m ATR%, high to low (screen of 2026-08-13).
PAIRS = {
    "TUT": "TUTUSDT",
    "PROM": "PROMUSDT",
    "COTI": "COTIUSDT",
    "BMT": "BMTUSDT",
    "STORJ": "STORJUSDT",
    "BICO": "BICOUSDT",
    "NIL": "NILUSDT",
    "LSK": "LSKUSDT",
    "ACE": "ACEUSDT",
    "BANK": "BANKUSDT",
    "HOLO": "HOLOUSDT",
    "EPIC": "EPICUSDT",
    "HEI": "HEIUSDT",
    "HOME": "HOMEUSDT",
    "AT": "ATUSDT",
    "2Z": "2ZUSDT",
    "BOME": "BOMEUSDT",
    "BROCCOLI714": "BROCCOLI714USDT",
    "BANANAS31": "BANANAS31USDT",
    "MITO": "MITOUSDT",
    "OPEN": "OPENUSDT",
    "RE": "REUSDT",
    "RIF": "RIFUSDT",
    "DEXE": "DEXEUSDT",
    "EUL": "EULUSDT",
    "MOVE": "MOVEUSDT",
    "TLM": "TLMUSDT",
    "ESP": "ESPUSDT",
    "EDU": "EDUUSDT",
    "PUMP": "PUMPUSDT",
    "CRV": "CRVUSDT",
    "GENIUS": "GENIUSUSDT",
    "FLOW": "FLOWUSDT",
    "MAV": "MAVUSDT",
    "ENSO": "ENSOUSDT",
}

BINANCE_WS_BASE   = "wss://stream.binance.com:9443/stream"
BINANCE_REST_BASE = "https://api.binance.com/api/v3"

# ─── Scalping Strategy Params ───────────────────────────────
SCALPING = {
    "trend_tf":          "15m",           # primary trend TF (legacy, used as fallback)
    "entry_tf":          "5m",            # entry signal TF
    "confirm_tfs":       ["1h", "30m", "15m", "5m"],  # multi-TF trend check (high→low)
    "bias_tf":           "1h",            # higher TF bias gate — must agree with signal
    "mtf_min_align":     4,               # ALL 4 TFs (1h/30m/15m/5m) must agree — no majority, full alignment required
    "atr_period":        14,
    "atr_sl_mult":       1.35,
    "sl_entry_r":        1.2,   # 2.5 → 1.0 (2026-07-26) → 1.2 (2026-08-13), per user
                                 # request. SL-out now reports -1.20R.
                                 #
                                 # NOTE: risk_amount stays anchored to the 1R distance
                                 # (atr * atr_sl_mult) — see risk_manager.calculate_position,
                                 # which does NOT read this key. So an SL-out loses
                                 # 1.2x risk_amount, and the shadow-trade check against
                                 # MAX_SL_PCT still measures the 1R distance, not the
                                 # 1.2R the stop is actually placed at.
    "tp_entry_r":        2.0,   # 3.5 → 2.5 (2026-07-26) → 1.5 → 2.0 (2026-08-13), per
                                 # user request. Hard-cap exit, not a plain TP — the
                                 # trade cannot run past it. Must stay above the
                                 # highest trail_steps trigger, or that step could
                                 # never fire.
    # Trailing ladder: [(peak_r_trigger, stop_r), ...]. The first time peak R
    # touches a trigger, the stop jumps to that step's level. The stop only ever
    # tightens — a later step can raise it, nothing lowers it, and it does NOT
    # ratchet continuously between steps. Absent/empty = trailing off (SWING has
    # no steps, so it exits on SL/TP only).
    #
    # History: single-shot breakeven lock (be_trigger_r/be_stop_r) removed
    # 2026-07-26 for a continuous ratchet; ratchet reverted to a single-shot lock
    # 2026-08-13; the scalar trail_trigger_r/trail_gap_r pair was replaced by this
    # list the same day to allow more than one step.
    #
    #   (0.8, -0.5)  Loss cut, not a profit lock. A trade that showed +0.8R and
    #                then reversed gives back 0.5R instead of the full 1.2R.
    #                Chosen over a (1.0, -0.5) step, which tested worse: BANK
    #                ran +1.0R, dipped below -0.5R, then recovered to +1.73R, so
    #                the later trigger cost more than it saved.
    #   (1.5, +1.0)  Profit lock, unchanged.
    #
    # Four outcomes now:
    #     peak below 0.8R          -> SL at -1.2R
    #     peak 0.8-1.5R, reverses  -> exit at -0.5R
    #     peak 1.5R+, fades        -> exit at +1.0R
    #     reaches 2.0R             -> TP
    "trail_steps":       [(0.8, -0.5), (1.5, 1.0)],
    "atr_tp_mult":       20.0,  # effectively disabled — exits via trailing SL only
    "max_hold_sec":      None,  # disabled — exit only via SL / TP / trailing SL
    "min_adx":           22,              # raised from 20 on 2026-07-03 — DB analysis of 329 scalping
                                           # trades: ADX 18-22 zone lost -$26,598 (38-44% WR), ADX 22+
                                           # made +$23,661 (52-62% WR). 20 was too loose; 25 too tight
                                           # (24-27 bucket was ~breakeven). 22 is the actual breakpoint.
    "rsi_period":        5,
    "rsi_oversold":      25,              # slightly relaxed from 20 — RSI rarely hits 20 on 5m
    "rsi_overbought":    75,              # slightly relaxed from 80 — catch overbought earlier
    "vwap_dev_pct":      0.30,            # raised from 0.15 — requires stronger VWAP extension before retracement fires
    "dom_ratio":         1.5,             # lowered from 2.0 — 2:1 orderbook imbalance is too rare
    "dom_levels":        10,
    "fvg_candles":       3,
    "sweep_threshold":   0.002,   # max spread between equal lows/highs to form a cluster
    "trend_candles":     100,
    "entry_candles":     100,
}

def style_cfg(style: str) -> dict:
    """Single source of truth for style -> params. Was duplicated as
    `SCALPING if style == "scalping" else SWING` in 8 places, which silently
    routed any new style to SWING."""
    return {"scalping": SCALPING, "swing": SWING}.get(style, SCALPING)


# ─── Swing Strategy Params ──────────────────────────────────
SWING = {
    "trend_tf":          "4h",
    "entry_tf":          "1h",
    "confirm_tfs":       ["4h", "1h", "30m"],   # multi-TF trend check (high→low)
    "mtf_min_align":     2,
    "atr_period":        14,
    "atr_sl_mult":       3.0,
    "atr_tp_mult":       9.0,
    "max_hold_sec":      None,  # disabled — exit only via SL / TP / trailing SL
    "min_adx":           18,              # swing trends develop slower, lower threshold ok
    "rsi_period":        14,
    "rsi_oversold":      35,              # slightly relaxed from 30
    "rsi_overbought":    65,              # slightly relaxed from 70
    "vwap_dev_pct":      0.8,             # lowered from 1.0 — 1% deviation is rare on swing
    "dom_ratio":         1.5,             # lowered from 2.0
    "dom_levels":        10,
    "fvg_candles":       3,
    "sweep_threshold":   0.002,
    "trend_candles":     100,
    "entry_candles":     100,
}

# ─── Risk Rules (hardcoded, never bypass) ───────────────────
MAX_DAILY_LOSS_PCT       = 100.0
MAX_WEEKLY_DRAWDOWN_PCT  = 100.0

# Per-trader daily loss-count lockout — added 2026-08-18 per user request
# (ported from ThinkTrade 2.0). Any 3 losing trades (pnl < 0, any amount)
# closed by the SAME trader_name on the SAME IST calendar day blocks that
# trader's new entries for the rest of that day (existing open positions are
# untouched; resets at IST midnight). Losses do not need to be consecutive.
# Shadow trades never count — they never touch the wallet and shouldn't gate
# real entries either.
# Replaces the old CONSECUTIVE_LOSS_LIMIT (3-in-a-row -> 1hr cooldown) rule,
# which this makes redundant: any 3-in-a-row is also 3-that-day, and this
# rule fires at the same time or earlier while blocking for the whole day
# instead of 1 hour.
MAX_DAILY_LOSSES_PER_TRADER = 3

# Max simultaneous trades
MAX_TRADES_NORMAL = 7

MAX_LEVERAGE             = 20.0  # hard ceiling — user can never go above this
DEFAULT_LEVERAGE         = 5.0   # default if user doesn't specify
MIN_SIGNAL_SCORE         = 4    # minimum layers out of 7

# ─── Trading Window (IST) ───────────────────────────────────
# New entries are opened ONLY inside this window, as (hour, minute) in IST
# (UTC+5:30). Set either side to None to disable the gate entirely.
#
# This blocks new entries only. Positions already open are untouched — they
# run to their own SL/TP/trailing exit whatever the clock says, so a trade
# opened at 06:55 is not force-closed at 07:00.
#
# Added 2026-08-13 per user request: trade 12:00 AM - 8:00 AM IST only.
# An earlier "quiet hours" gate (2-8 AM IST, commit 9073d92) did the inverse
# — it named the blocked window — and its comparison only worked when start
# < end. This names the ALLOWED window and handles wrap-around, so a window
# that crosses midnight (e.g. 22:00 -> 04:00) works too.
# Disabled 2026-08-19 per user request — bot trades all day again. Left as
# None/None (the documented disable switch above) rather than deleting the
# gate code in bot_controller.py, so it can be turned back on by just
# setting these two values again.
TRADE_WINDOW_START = None    # gate disabled — trade all day
TRADE_WINDOW_END   = None    # gate disabled — trade all day

# Shadow-trade threshold — max SL distance as a fraction of position size.
# SL% is exactly risk_amount / position_size_usd, so this caps "how much of the
# money in the market can one trade lose".
#
# Added 2026-08-10 from a 19-trade DB review: 17 trades sat at 0.56-2.78% SL,
# but two TST shorts ran 3.91% and 6.26% and lost -$6,416 and -$9,260 — together
# more than the account's entire -$12,208 drawdown. Position size never looks at
# ATR, so a volatile pair's wide ATR-derived SL scales the dollar loss with
# nothing to stop it (no max_sl / risk cap existed anywhere in the codebase).
#
# Trades above this threshold are NOT skipped — they are taken as "shadow"
# trades: fully recorded with their natural (wide) SL so the data stays honest,
# but excluded from wallet, stats, and every risk counter. Once enough shadow
# trades accumulate, this threshold can be re-tuned on real evidence instead of
# the two data points available today.
#
# Raised 2.5% -> 3.0% on 2026-08-13 per user request, alongside the move to the
# new 35-pair list, which is screened for volatility and so sits wider on ATR
# than the list this cap was originally set against.
#
# Measured against the 1R distance (atr * atr_sl_mult), NOT against the stop
# actually placed — sl_entry_r is 1.2, so a pair sitting just under this cap
# has its real stop ~3.6% away. See risk_manager.calculate_position.
MAX_SL_PCT = 0.030   # 3.0%

# ─── Adaptive Per-Pair Filter ───────────────────────────────
# Learns from this bot's OWN closed trades: keeps a rolling window of the last
# ADAPTIVE_K net-R results per pair and blocks new entries on pairs whose recent
# mean net-R is negative. Causal by construction — only CLOSED trades feed it.
#
# Tuned 2026-07-26 on a 3-window / 50-pair / 17,214-signal candle backtest
# (20 Jun - 26 Jul). At current taker fees the per-pair bucket cut the loss
# roughly in half: -0.092 -> -0.045 R/trade, win rate 66.3% -> 67.8%.
# K=20 beat K=10 (-0.048) and K=40 (-0.050). Feeding it only TAKEN trades beat
# feeding it every signal, by a wide margin.
ADAPTIVE_ENABLED         = True
ADAPTIVE_K               = 20    # rolling window of recent net-R per pair
ADAPTIVE_MIN_SAMPLES     = 10    # need this many before the filter can block
# A blocked pair records no new results, so without this it would stay blocked
# forever. Every PROBE_SECS one trade is let through to re-test the pair.
#
# Measured 2026-07-26 (36 days, taker fees) — a probe is by construction a trade
# on a pair already known to be losing, so short intervals destroy the filter:
#     permanent block  -0.045 R/trade   (best, but winds down to ~7 trades/day,
#                                        94% of pairs blocked, 4 zero-trade days)
#     probe 7d         -0.063           (keeps ~10 trades/day, no silent days)
#     baseline / off   -0.092
#     probe 6h         -0.136  WORSE than no filter at all
# A "shadow" variant (track blocked pairs on paper, unblock when they recover)
# was also tested and came out at -0.105 — also worse than baseline, because it
# lets pairs back in on noise. Rejected.
#
# 7d is the compromise: still beats baseline, and the bot never goes silent.
# Set very high (e.g. 10**9) for permanent blocks = best measured R/trade.
ADAPTIVE_PROBE_SECS      = 7 * 86400

# ─── Bot internals ──────────────────────────────────────────
SIGNAL_BROADCAST_INTERVAL = 2   # seconds between WS broadcasts
POSITION_CHECK_INTERVAL   = 0.2 # seconds between position monitor ticks (0.5→0.2 on
                                # 2026-07-17 to cut SL/TP exit overshoot on volatile coins.
                                # Reads local WS price (last_price dict), NOT Binance REST —
                                # so no extra exchange API load.
KLINE_HISTORY_LIMIT       = 150 # candles to fetch on startup
