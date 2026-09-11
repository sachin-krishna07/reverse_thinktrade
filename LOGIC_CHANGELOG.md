# ThinkTrade Version-3.0 — Logic Changelog

Kaunse period me bot kis logic par chala, aur us period ka result kya raha.
Har naya logic change yahan ek naye section me likhna — taaki baad me analysis
karte waqt pata rahe ki kaunsi trades kis logic ki hain.

> Supabase me is bot ki trades: `trader_name = 'Version-3.0'`, `mode = 'demo'`.
> Sab time **IST** me hain.

---

## Period 1 — 21 Aug 2026 se 11 Sep 2026 tak

**Commit:** `4de5489` — "remove per-trader daily loss-count lockout" (21 Aug 2026).
Is period ka analysis 21 Aug 00:00 IST se liya gaya hai. 21 se pehle doosra logic tha,
wo trades (12–20 Aug) is period me count nahi hoti.

### Entry logic (signal)
- **Timeframes:** entry 5m; trend check 1h / 30m / 15m / 5m — **chaaron** same direction me hone chahiye
  (EMA9 vs EMA21 + DI+/DI−, aur har TF par ADX ≥ 22). 5m ki direction bhi match honi chahiye.
- **1H trend bias gate:** 1h ADX ≥ 20 ho aur 1h trend ulta ho → trade nahi.
- **1H RSI extreme:** sirf calculate/display hota hai, **block nahi karta** (12 Aug se band).
- **Score (7 layers, min 4 chahiye):** L1 multi-TF trend, L2 CVD divergence, L3 VWAP retracement,
  L4 DOM imbalance, L5 RSI extreme + hook, L6 liquidity sweep, L7 FVG.
- **L8 EMA pullback (mandatory):** 5m price EMA9 ke 0.75% ke andar hona chahiye.
- **BTC bias gate:** removed.
- Asal me (data me): score hamesha **4** raha — SWEEP + EMA pullback 100% trades me, FVG 99%,
  VWAP 86%. DOM aur RSI2 layer kabhi fire nahi hui.

### Trade / risk
- Position size = balance × capital% × leverage (default leverage 5x). Data me ~1.05–1.33 lakh USD notional per trade.
- `risk_amount` = position × (ATR × 1.35 / price) → yeh **1R** hai.
- **SL = 1.2R** entry se (SL hit par ≈ −1.2R). **TP = 2.0R** (hard cap).
- **Trailing ladder:** peak 0.8R → SL −0.5R pe; peak 1.5R → SL +1.0R pe.
- **Shadow trade:** 1R SL distance > 3.0% of price → trade record hoti hai par wallet/stats me count nahi.
- Max 7 trades ek saath, ek pair me ek hi position, ek scan cycle me max 1 nayi entry.
- Adaptive per-pair filter ON (last 20 trades ka net R negative → pair block, 7 din me 1 probe).
- **Per-trader daily loss lockout: REMOVED** (isi commit me).
- **Trading window / night gate: OFF** — 24 ghante trade (19 Aug se).
- **Pairs:** 35 coins (13 Aug ki screen) — DEXE, EPIC, CRV bhi shamil the.
- Direction reverse OFF (data me har trade signal ki direction me hi thi).

### Result (sirf real trades, shadow nahi)
| Metric | Value |
|---|---|
| Trades | 145 (54 win / 85 loss / 6 crash_recovery) |
| Win rate | 37.2% |
| Net PnL | **+11,842** (fees −16,697) |
| Profit / loss din | 14 / 8 (22 din) |
| Max drawdown | −14,009 |
| Shadow trades (alag) | 5 trades, net −8,968 |

### Is period me kya pata chala
- **18:00–01:00 IST** ki entries: 24 trades, 4 win, **−23,651**. Baaki din: 121 trades, 50 win, +35,493.
- **Sabse kharab coins (din ke time):** DEXE 0/5 win −5,358 · EPIC 3/11 −2,992 · CRV 3/9 −2,346.
- Tight SL (< 1% price) wali trades loss me; wide SL (≥ 1.5%) ne profit banaya.
- Trailing exits: 36 loss me (−32,377); trailing wins kabhi +1R se upar nahi.
- Shorts kamzor (−4,622) vs longs (+16,464).

---

## Period 2 — Naya logic (deploy date se aage)

**Deploy date / commit:** `____________` ← deploy karte hi yahan date-time (IST) aur commit hash likhna.
Period 2 ka analysis isi time se shuru karna.

### Kya badla (Period 1 ke mukable)
1. **Night gate ON:** 6:00 PM se 1:00 AM IST tak **koi nayi entry nahi**.
   - `config.py`: `TRADE_WINDOW_START = (1, 0)`, `TRADE_WINDOW_END = (18, 0)` (yeh ALLOWED window hai).
   - Khuli position band nahi hoti — apne SL/TP/trailing se hi exit karegi. Signals UI par chalte rahenge.
   - Logs (Logs page + Supabase `bot_logs`):
     `🌙 Night gate ON (18:00–01:00 IST)…`, `🌙 Night gate: PAIR LONG signal (score 4/7) skipped @ HH:MM IST…`
     (per pair per 5-min candle ek baar), `☀️ Night gate OFF — entries resumed…`
2. **3 coins hataye:** DEXE, EPIC, CRV — `backend/config.py` (`PAIRS`) aur
   `frontend/src/components/BotControls.tsx` (`ALL_PAIRS`) dono se. Ab **32 coins**.

### Kya NAHI badla
Baaki sab Period 1 jaisa — signal layers, SL 1.2R / TP 2.0R, trailing ladder, shadow rule,
adaptive filter, position sizing, max trades.

### Expected (Period 1 ke data par, sirf andaza — guarantee nahi)
| | Trades | Win rate | Net |
|---|---|---|---|
| Period 1 actual | 145 | 37.2% | +11,842 |
| Night gate + 3 coin hata ke (same data) | 96 | ~47.8% | ~+46,187 |

---

## Test kiye par abhi LAGAYE NAHI (future ideas)
- **EMA9 distance filter:** trade tabhi lo jab price 1H EMA9 se trade ki direction me > 2% (ya 2.5%) door ho.
  Period 1 me: ≤ 2.5% wali 95 trades 23 win, −36,117; > 2.5% wali 50 trades 31 win, +47,955.
  Abhi nahi lagaya — sirf 3 hafte ka data, threshold sensitive (3% par result girta hai).
  `signals_at_entry` me `price` aur `ema9_value` pehle se save hote hain, isliye Period 2 ke data par
  bina code change ke dobara check ho sakta hai.
- **VWAP ke paas entry** (|vwap_dev_pct| ≤ 0.2%): 25 trades, 4 win, −22,857 — sample chhota.
- **Trailing ladder change:** research adhoori (peak/MFE analysis complete nahi hua).

---

## Period 2 ka analysis kaise karna
```sql
SELECT COUNT(*) trades,
       SUM((net_pnl > 0)::int) wins,
       ROUND(100.0 * AVG((net_pnl > 0)::int), 1) win_pct,
       ROUND(SUM(net_pnl), 0) net
FROM trades
WHERE trader_name = 'Version-3.0' AND mode = 'demo'
  AND status = 'closed' AND NOT is_shadow
  AND entry_time >= '<DEPLOY DATE-TIME>+05:30';
```
