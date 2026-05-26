from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import logging

log = logging.getLogger("supabase_client")

_client: Optional[Client] = None

def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


# ─── Bot Config ─────────────────────────────────────────────

def get_bot_config() -> Dict:
    row = get_client().table("bot_config").select("*").limit(1).execute()
    return row.data[0] if row.data else {}

def update_bot_config(**kwargs) -> None:
    kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_client().table("bot_config").update(kwargs).neq("id", "00000000-0000-0000-0000-000000000000").execute()


# ─── Wallet ─────────────────────────────────────────────────

def get_wallet(mode: str) -> Dict:
    row = get_client().table("wallet").select("*").eq("mode", mode).limit(1).execute()
    return row.data[0] if row.data else {}

def update_wallet(mode: str, balance: float, total_pnl: float, initial: float,
                  daily_pnl: float) -> None:
    total_pnl_pct = (total_pnl / initial * 100) if initial > 0 else 0
    daily_pnl_pct = (daily_pnl / initial * 100) if initial > 0 else 0
    get_client().table("wallet").update({
        "balance":       balance,
        "total_pnl":     total_pnl,
        "total_pnl_pct": round(total_pnl_pct, 4),
        "daily_pnl":     daily_pnl,
        "daily_pnl_pct": round(daily_pnl_pct, 4),
        "updated_at":    datetime.now(timezone.utc).isoformat(),
    }).eq("mode", mode).execute()

def reset_daily_pnl(mode: str) -> None:
    get_client().table("wallet").update({
        "daily_pnl":     0,
        "daily_pnl_pct": 0,
        "updated_at":    datetime.now(timezone.utc).isoformat(),
    }).eq("mode", mode).execute()


# ─── Trades ─────────────────────────────────────────────────

def open_trade(trade_data: Dict) -> str:
    result = get_client().table("trades").insert(trade_data).execute()
    return result.data[0]["id"] if result.data else None

def close_trade(trade_id: str, exit_price: float, pnl: float, pnl_pct: float,
                r_multiple: float, exit_reason: str, duration_sec: int,
                fee: float = 0, net_pnl: float = 0) -> None:
    get_client().table("trades").update({
        "exit_price":       exit_price,
        "pnl":              pnl,
        "pnl_pct":          pnl_pct,
        "r_multiple":       r_multiple,
        "status":           "closed",
        "exit_reason":      exit_reason,
        "exit_time":        datetime.now(timezone.utc).isoformat(),
        "duration_seconds": duration_sec,
        "fee":              round(fee, 4),
        "net_pnl":          round(net_pnl, 4),
    }).eq("id", trade_id).execute()

def get_trades(mode: str, limit: int = 50) -> list:
    result = get_client().table("trades")\
        .select("*")\
        .eq("mode", mode)\
        .order("created_at", desc=True)\
        .limit(limit)\
        .execute()
    return result.data or []

def count_consecutive_losses(mode: str) -> int:
    result = get_client().table("trades")\
        .select("pnl")\
        .eq("mode", mode)\
        .eq("status", "closed")\
        .order("exit_time", desc=True)\
        .limit(10)\
        .execute()
    count = 0
    for row in (result.data or []):
        if row["pnl"] is not None and row["pnl"] < 0:
            count += 1
        else:
            break
    return count

def get_today_pnl(mode: str) -> float:
    today = datetime.now(timezone.utc).date().isoformat()
    result = get_client().table("trades")\
        .select("pnl")\
        .eq("mode", mode)\
        .eq("status", "closed")\
        .gte("exit_time", today)\
        .execute()
    return sum(r["pnl"] for r in (result.data or []) if r["pnl"] is not None)


# ─── Position ────────────────────────────────────────────────

def open_position(pos_data: Dict) -> str:
    result = get_client().table("positions").insert(pos_data).execute()
    return result.data[0]["id"] if result.data else None

def update_position(pos_id: str, current_price: float, unrealized_pnl: float,
                    unrealized_pnl_pct: float, highest_pnl: float,
                    trailing_sl: Optional[float] = None,
                    breakeven_hit: bool = False,
                    lock_profit_hit: bool = False,
                    sl_price: Optional[float] = None) -> None:
    payload: Dict[str, Any] = {
        "current_price":      current_price,
        "unrealized_pnl":     unrealized_pnl,
        "unrealized_pnl_pct": unrealized_pnl_pct,
        "highest_pnl":        highest_pnl,
        "breakeven_hit":      breakeven_hit,
        "lock_profit_hit":    lock_profit_hit,
        "updated_at":         datetime.now(timezone.utc).isoformat(),
    }
    if trailing_sl is not None:
        payload["trailing_sl"] = trailing_sl
    if sl_price is not None:
        payload["sl_price"] = sl_price
    get_client().table("positions").update(payload).eq("id", pos_id).execute()

def close_position(pos_id: str) -> None:
    get_client().table("positions").update({
        "status":     "closed",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pos_id).execute()

def get_active_position() -> Optional[Dict]:
    result = get_client().table("positions")\
        .select("*")\
        .eq("status", "active")\
        .limit(1)\
        .execute()
    return result.data[0] if result.data else None


# ─── Signals ─────────────────────────────────────────────────

def upsert_signal(pair: str, data: Dict) -> None:
    MAX_VAL = 9_999_999_999.9999
    cleaned: Dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, float):
            if v != v or abs(v) == float("inf"):
                cleaned[k] = None
            else:
                cleaned[k] = max(-MAX_VAL, min(MAX_VAL, round(v, 4)))
        else:
            cleaned[k] = v
    cleaned["pair"]       = pair
    cleaned["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_client().table("signals").upsert(cleaned, on_conflict="pair").execute()


# ─── Bot Logs ────────────────────────────────────────────────

def save_log(entry: dict) -> None:
    """Insert a single log entry into bot_logs table. Silently ignores errors."""
    try:
        get_client().table("bot_logs").insert({
            "ts":    entry["ts"],
            "level": entry["level"],
            "name":  entry["name"],
            "msg":   entry["msg"],
        }).execute()
    except Exception:
        pass  # Never raise from here — would cause infinite logging loop

def get_logs_from_db(limit: int = 300, level: str = "", name: str = "") -> list:
    q = get_client().table("bot_logs").select("ts,level,name,msg")
    if level:
        q = q.eq("level", level.upper())
    if name:
        q = q.eq("name", name)
    result = q.order("ts", desc=True).limit(limit).execute()
    return list(reversed(result.data or []))


# ─── Performance ─────────────────────────────────────────────

def upsert_performance(mode: str) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    trades_result = get_client().table("trades")\
        .select("pnl, r_multiple")\
        .eq("mode", mode)\
        .eq("status", "closed")\
        .gte("exit_time", today)\
        .execute()
    rows = trades_result.data or []
    total   = len(rows)
    won     = sum(1 for r in rows if r["pnl"] and r["pnl"] > 0)
    lost    = total - won
    pnl_sum = sum(r["pnl"] for r in rows if r["pnl"] is not None)
    rmults  = [r["r_multiple"] for r in rows if r["r_multiple"] is not None]
    avg_r   = sum(rmults) / len(rmults) if rmults else 0
    pnls    = [r["pnl"] for r in rows if r["pnl"] is not None]
    best    = max(pnls) if pnls else 0
    worst   = min(pnls) if pnls else 0
    get_client().table("performance").upsert({
        "date":         today,
        "mode":         mode,
        "trades_total": total,
        "trades_won":   won,
        "trades_lost":  lost,
        "win_rate":     round(won / total * 100, 2) if total > 0 else 0,
        "total_pnl":    pnl_sum,
        "avg_r":        round(avg_r, 4),
        "best_trade":   best,
        "worst_trade":  worst,
    }, on_conflict="date,mode").execute()
