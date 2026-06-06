import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useExchangeRate } from "@/hooks/useExchangeRate";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface Trade {
  id: string;
  pair: string;
  direction: string;
  style: string;
  entry_price: number;
  exit_price: number;
  position_size_usd: number;
  risk_amount: number;
  pnl: number;
  pnl_pct: number;
  r_multiple: number;
  fee: number;
  net_pnl: number;
  exit_reason: string;
  status: string;
  created_at: string;
  exit_time: string;
  duration_seconds: number;
  trader_name: string;
}

interface Props {
  mode: string;
}

const PAGE_SIZE = 20;

function formatDuration(s: number | null) {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

function getDateLabel(iso: string | null | undefined) {
  if (!iso) return "Unknown";
  const IST = "Asia/Kolkata";
  const d   = new Date(iso);
  // Compare calendar dates in IST — not a 24h rolling window
  const tradeDate = d.toLocaleDateString("en-CA", { timeZone: IST }); // YYYY-MM-DD
  const today     = new Date().toLocaleDateString("en-CA", { timeZone: IST });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: IST });
  if (tradeDate === today)     return "Today";
  if (tradeDate === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });
}

export default function TradeHistory({ mode }: Props) {
  const [trades, setTrades]   = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit]     = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const { fmtINR } = useExchangeRate();

  const fetchTrades = async (lim: number) => {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .eq("mode", mode)
      .eq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(lim + 1);

    if (data) {
      setHasMore(data.length > lim);
      setTrades(data.slice(0, lim) as Trade[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLimit(PAGE_SIZE);
    setLoading(true);
    fetchTrades(PAGE_SIZE);
  }, [mode]);

  useEffect(() => {
    const channel = supabase
      .channel("trades_changes")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trades",
        filter: `mode=eq.${mode}`,
      }, () => fetchTrades(limit))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mode, limit]);

  const loadMore = () => {
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    fetchTrades(newLimit);
  };

  const closedTrades = trades.filter((t) => t.status === "closed");

  // Group trades by date — use exit_time if set, else created_at for date label
  const grouped: { date: string; trades: Trade[] }[] = [];
  closedTrades.forEach((t) => {
    const label = getDateLabel(t.exit_time || t.created_at);
    const last  = grouped[grouped.length - 1];
    if (last && last.date === label) {
      last.trades.push(t);
    } else {
      grouped.push({ date: label, trades: [t] });
    }
  });

  return (
    <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2433]">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Trade History</h2>
        <span className="text-xs text-gray-500">{closedTrades.length} trades</span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-600 text-sm">Loading...</div>
      ) : closedTrades.length === 0 ? (
        <div className="p-8 text-center text-gray-600 text-sm">No completed trades yet</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2433] text-gray-500 text-[10px] uppercase">
                  <th className="px-4 py-2 text-left">Trader</th>
                  <th className="px-4 py-2 text-left">Pair</th>
                  <th className="px-3 py-2 text-left">Dir</th>
                  <th className="px-3 py-2 text-left">Style</th>
                  <th className="px-3 py-2 text-right">Entry</th>
                  <th className="px-3 py-2 text-right">Exit</th>
                  <th className="px-3 py-2 text-right">Size</th>
                  <th className="px-3 py-2 text-right">Risk</th>
                  <th className="px-3 py-2 text-right">Gross P&L</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                  <th className="px-3 py-2 text-right">Net P&L</th>
                  <th className="px-3 py-2 text-right">R</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Dur</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => (
                  <React.Fragment key={group.date}>
                    {/* Date separator */}
                    <tr>
                      <td colSpan={15} className="px-4 pt-3 pb-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest whitespace-nowrap">
                            {group.date}
                          </span>
                          <div className="flex-1 h-px bg-[#1e2433]" />
                          <span className="text-[10px] text-gray-600 whitespace-nowrap">
                            {group.trades.length} trade{group.trades.length > 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {group.trades.map((t) => {
                      const pnl    = t.pnl    ?? 0;
                      const netPnl = t.net_pnl ?? pnl;
                      const win    = pnl >= 0;
                      return (
                        <tr key={t.id}
                          className="border-b border-[#1a2030] hover:bg-[#1a2030] transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                              {t.trader_name || "Unknown"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white">{t.pair}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.direction === "long"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-red-500/20 text-red-400"
                            }`}>
                              {t.direction?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 capitalize">{t.style}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300 font-mono">
                            {t.entry_price?.toFixed(4) ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-300 font-mono">
                            {t.exit_price?.toFixed(4) ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-indigo-300 font-mono font-medium">
                            {fmtINR(t.position_size_usd ?? 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-orange-300 font-mono">
                            {fmtINR(t.risk_amount ?? 0, 4)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono ${win ? "text-green-400/70" : "text-red-400/70"}`}>
                            {win ? "+" : ""}{fmtINR(pnl, 4)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-400/60">
                            -{fmtINR(t.fee ?? 0, 4)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold font-mono ${netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {netPnl >= 0 ? "+" : ""}{fmtINR(netPnl, 4)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono ${win ? "text-green-400/70" : "text-red-400/70"}`}>
                            {(t.r_multiple ?? 0) >= 0 ? "+" : ""}{(t.r_multiple ?? 0).toFixed(2)}R
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-gray-500 capitalize">{t.exit_reason ?? "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                            {formatTime(t.exit_time)}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {formatDuration(t.duration_seconds)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More — always show count, button only if more exist */}
          <div className="px-4 py-3 border-t border-[#1e2433] flex items-center justify-between">
            <span className="text-[10px] text-gray-600">
              Showing {closedTrades.length} trades
            </span>
            {hasMore ? (
              <button
                onClick={loadMore}
                className="px-5 py-1.5 rounded-lg text-xs font-semibold
                           bg-indigo-500/15 border border-indigo-500/40 text-indigo-300
                           hover:bg-indigo-500/25 transition-all"
              >
                Load More ↓
              </button>
            ) : (
              <span className="text-[10px] text-gray-600">All trades loaded</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
