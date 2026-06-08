-- ============================================================
-- ThinkTrade — Migration: Add missing columns & bot_logs table
-- Run this in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- Add missing columns to trades table
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS fee          DECIMAL(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_pnl      DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS signal_score DECIMAL(5,2);

-- Create bot_logs table if missing
CREATE TABLE IF NOT EXISTS bot_logs (
  id    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ts    TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL,
  name  TEXT NOT NULL,
  msg   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bot_logs_ts_idx ON bot_logs (ts DESC);

-- Disable RLS on bot_logs
ALTER TABLE bot_logs DISABLE ROW LEVEL SECURITY;
