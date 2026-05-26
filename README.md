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
