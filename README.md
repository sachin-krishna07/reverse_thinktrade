# ThinkTrade — Crypto Trading Bot

Automated crypto trading bot with 7-layer signal engine, real-time dashboard, and Supabase integration.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, WebSocket |
| Frontend | React, TypeScript, Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Market Data | Binance API |
| Charts/UI | Recharts, shadcn/ui |

## Run Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: http://localhost:8080  
Backend runs on: http://localhost:8000

## Signal Layers (7-Layer Engine)

| Layer | Name | What it does |
|-------|------|--------------|
| L1 | Multi-TF Trend | All 3 timeframes must agree on same direction — mandatory gate, no trade without this |
| L2 | CVD Divergence | Checks real buying/selling volume — if price and volume diverge, signal confirmed |
| L3 | VWAP Deviation | Price must be returning toward VWAP from an extreme — confirms retracement entry |
| L4 | DOM Imbalance | Order book buy/sell pressure difference — confirms institutional interest |
| L5 | RSI Extreme + Hook | RSI must be in oversold/overbought zone and already turning back — avoids catching falling knife |
| L6 | Liquidity Sweep | Price swept stop losses first then reversed — smart money trap confirmed |
| L7 | Fair Value Gap | Price trading inside an unfilled gap (FVG) — high probability fill zone |

> **Score 4/7 or above** = Trade signal active  
> **L1 fail** = No trade, remaining layers are skipped

## Environment Variables

### Backend — `backend/.env`
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

### Frontend — `frontend/.env`
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_BOT_WS_URL=ws://localhost:8000/ws
VITE_BOT_API_URL=http://localhost:8000
```
