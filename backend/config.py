import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DEMO_INITIAL_BALANCE = float(os.getenv("DEMO_INITIAL_BALANCE", 10000))

# ─── Pairs: display name → Binance symbol ───────────────────
PAIRS = {
    "BTC":  "BTCUSDT",
    "ETH":  "ETHUSDT",
    "SOL":  "SOLUSDT",
    "BNB":  "BNBUSDT",
    "XRP":  "XRPUSDT",
    "DOGE": "DOGEUSDT",
    "ADA":  "ADAUSDT",
    "AVAX": "AVAXUSDT",
    "LINK": "LINKUSDT",
    "DOT":  "DOTUSDT",
    "LTC":  "LTCUSDT",
    "ATOM": "ATOMUSDT",
    "ARB":  "ARBUSDT",
    "OP":   "OPUSDT",
    "INJ":  "INJUSDT",
    "SUI":  "SUIUSDT",
    "NEAR": "NEARUSDT",
    "APT":  "APTUSDT",
    "TIA":  "TIAUSDT",
    "TON":  "TONUSDT",
    "WIF":    "WIFUSDT",
    "PEPE":   "PEPEUSDT",
    "JUP":    "JUPUSDT",
    # ── DeFi Blue-Chips ─────────────────────────────────────
    "AAVE":   "AAVEUSDT",
    "UNI":    "UNIUSDT",
    "CRV":    "CRVUSDT",
    "LDO":    "LDOUSDT",
    "PENDLE": "PENDLEUSDT",
    # ── Layer 1 / Infra ─────────────────────────────────────
    "MATIC":  "MATICUSDT",
    "FIL":    "FILUSDT",
    "ICP":    "ICPUSDT",
    "HBAR":   "HBARUSDT",
    "STX":    "STXUSDT",
    "GRT":    "GRTUSDT",
    # ── Ecosystem / Mid-caps ─────────────────────────────────
    "RUNE":   "RUNEUSDT",
    "PYTH":   "PYTHUSDT",
    "EIGEN":  "EIGENUSDT",
    # ── Meme / High-vol ──────────────────────────────────────
    "SHIB":   "SHIBUSDT",
    "FLOKI":  "FLOKIUSDT",
    "NOT":    "NOTUSDT",
    "TURBO":  "TURBOUSDT",
    # ── BTC Ordinals / Meta ───────────────────────────────────
    "ORDI":   "ORDIUSDT",
}

BINANCE_WS_BASE  = "wss://stream.binance.com:9443/stream"
BINANCE_REST_BASE = "https://api.binance.com/api/v3"

# ─── Scalping Strategy Params ───────────────────────────────
SCALPING = {
    "trend_tf":          "15m",           # primary trend TF (legacy, used as fallback)
    "entry_tf":          "5m",            # entry signal TF
    "confirm_tfs":       ["30m", "15m", "5m"],  # multi-TF trend check (high→low)
    "mtf_min_align":     2,               # min TFs that must agree (out of 3)
    "atr_period":        14,
    "atr_sl_mult":       1.5,
    "atr_tp_mult":       3.0,
    "max_hold_sec":      None,  # disabled — exit only via SL / TP / trailing SL
    "min_adx":           20,              # lowered from 25 — 25 was blocking valid trends (e.g. ADX 24.3)
    "rsi_period":        5,
    "rsi_oversold":      25,              # slightly relaxed from 20 — RSI rarely hits 20 on 5m
    "rsi_overbought":    75,              # slightly relaxed from 80 — catch overbought earlier
    "vwap_dev_pct":      0.15,            # lowered from 0.2 — ETH/BTC deviations often under 0.2%
    "dom_ratio":         1.5,             # lowered from 2.0 — 2:1 orderbook imbalance is too rare
    "dom_levels":        10,
    "fvg_candles":       3,
    "sweep_threshold":   0.002,   # max spread between equal lows/highs to form a cluster
    "trend_candles":     100,
    "entry_candles":     100,
}

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
MAX_CONSECUTIVE_LOSSES   = 5
COOLDOWN_MINUTES         = 20
MAX_LEVERAGE             = 20.0  # hard ceiling — user can never go above this
DEFAULT_LEVERAGE         = 5.0   # default if user doesn't specify
MIN_SIGNAL_SCORE         = 4    # minimum layers out of 7

# ─── Bot internals ──────────────────────────────────────────
SIGNAL_BROADCAST_INTERVAL = 2   # seconds between WS broadcasts
POSITION_CHECK_INTERVAL   = 0.5 # seconds between position monitor ticks
KLINE_HISTORY_LIMIT       = 150 # candles to fetch on startup
