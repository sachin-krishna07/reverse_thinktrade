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

| Layer | Name | Kya karta hai |
|-------|------|---------------|
| L1 | Multi-TF Trend | 3 timeframes me trend ek direction me ho tabhi signal milta hai (mandatory) |
| L2 | CVD Divergence | Buyers/sellers ka real volume dekho — price aur volume opposite ho toh signal |
| L3 | VWAP Deviation | Price VWAP se kitna door hai — retracement confirm karta hai |
| L4 | DOM Imbalance | Order book me buy/sell pressure ka fark dekho |
| L5 | RSI Extreme | RSI oversold/overbought zone me ho aur wapas palat raha ho |
| L6 | Liquidity Sweep | Price ne pehle SL hunt kiya phir reverse hua |
| L7 | Fair Value Gap | Price me gap (FVG) hai jahan re-entry hogi |

> **Score 4/7 ya usse zyada** = Trade signal active  
> **L1 fail** = Koi trade nahi, baaki layers check nahi hote

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
