import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import AppHeader from "@/components/AppHeader";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Zap,
  Trophy, AlertTriangle, CheckCircle, Info,
  BarChart2, Activity,
} from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LAYER_KEYS = [
  { key: "trend_regime",    label: "L1", name: "Multi-TF Trend"  },
  { key: "cvd_divergence",  label: "L2", name: "CVD Divergence"  },
  { key: "vwap_deviation",  label: "L3", name: "VWAP Deviation"  },
  { key: "dom_imbalance",   label: "L4", name: "DOM Imbalance"   },
  { key: "rsi2_extreme",    label: "L5", name: "RSI Extreme"     },
  { key: "liquidity_sweep", label: "L6", name: "Liquidity Sweep" },
  { key: "fair_value_gap",  label: "L7", name: "Fair Value Gap"  },
];

interface Trade {
  pnl: number;
  net_pnl: number;
  r_multiple: number;
  signals_at_entry: any;
  pair: string;
  direction: string;
  exit_reason: string;
  created_at: string;
  style: string;
  signal_score: number;
}

function winRate(wins: number, total: number) {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}
function avgR(rSum: number, total: number) {
  return total > 0 ? Math.round((rSum / total) * 100) / 100 : 0;
}

const exitLabel: Record<string, string> = {
  sl: "Stop Loss", tp: "Take Profit", trailing: "Trailing SL",
  "2r_target": "2R Target", "3r_target": "3R Target",
  "4r_target": "4R Target", breakeven: "Breakeven", manual: "Manual",
};

// Custom tooltip for charts
function ChartTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1117] border border-[#2a3045] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }} className="font-bold font-mono">
          {fmt ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [mode, setMode]     = useState<"demo" | "live">("demo");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { fmtINR } = useExchangeRate();

  const fetchTrades = async (m: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("trades")
      .select("pnl, net_pnl, r_multiple, signals_at_entry, pair, direction, exit_reason, created_at, style, signal_score")
      .eq("mode", m).eq("status", "closed")
      .order("created_at", { ascending: true });
    setTrades((data as Trade[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTrades(mode); }, [mode]);
  useEffect(() => {
    const ch = supabase.channel("analytics_watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: `mode=eq.${mode}` },
        () => fetchTrades(mode)).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mode]);

  // ── Compute all stats ──────────────────────────────────────
  const stats = useMemo(() => {
    const total = trades.length;
    const wins  = trades.filter(t => t.pnl > 0).length;
    const totalPnl = trades.reduce((s, t) => s + (t.net_pnl || t.pnl || 0), 0);
    const totalR   = trades.reduce((s, t) => s + (t.r_multiple || 0), 0);
    const wr = winRate(wins, total);
    const ar = avgR(totalR, total);

    // Equity curve
    let running = 0;
    const equity = trades.map((t, i) => {
      running += t.net_pnl || t.pnl || 0;
      return { i: i + 1, pnl: Math.round(running * 100) / 100 };
    });

    // By pair
    const pairMap: Record<string, { wins: number; losses: number; total: number; rSum: number; pnl: number }> = {};
    trades.forEach(t => {
      if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, losses: 0, total: 0, rSum: 0, pnl: 0 };
      pairMap[t.pair].total++;
      pairMap[t.pair].pnl += t.pnl || 0;
      pairMap[t.pair].rSum += t.r_multiple || 0;
      if (t.pnl > 0) pairMap[t.pair].wins++;
      else pairMap[t.pair].losses++;
    });
    const pairStats = Object.entries(pairMap).map(([pair, s]) => ({
      pair, ...s, wr: winRate(s.wins, s.total), ar: avgR(s.rSum, s.total),
    })).sort((a, b) => b.pnl - a.pnl);

    // Direction
    const dirMap: Record<string, { wins: number; total: number; rSum: number }> = {
      long: { wins:0,total:0,rSum:0 }, short: { wins:0,total:0,rSum:0 }
    };
    trades.forEach(t => {
      if (!dirMap[t.direction]) return;
      dirMap[t.direction].total++;
      dirMap[t.direction].rSum += t.r_multiple || 0;
      if (t.pnl > 0) dirMap[t.direction].wins++;
    });

    // Exit reasons
    const exitMap: Record<string, { total: number; rSum: number; wins: number }> = {};
    trades.forEach(t => {
      const r = t.exit_reason || "unknown";
      if (!exitMap[r]) exitMap[r] = { total: 0, rSum: 0, wins: 0 };
      exitMap[r].total++;
      exitMap[r].rSum += t.r_multiple || 0;
      if (t.pnl > 0) exitMap[r].wins++;
    });
    const exitStats = Object.entries(exitMap).map(([reason, s]) => ({
      reason, name: exitLabel[reason] || reason, ...s,
      wr: winRate(s.wins, s.total), ar: avgR(s.rSum, s.total),
    })).sort((a, b) => b.total - a.total);

    // Score map
    const scoreMap: Record<number, { wins: number; total: number; rSum: number }> = {};
    trades.forEach(t => {
      const sc = Number(t.signal_score || t.signals_at_entry?.total_score);
      if (!sc) return;
      if (!scoreMap[sc]) scoreMap[sc] = { wins: 0, total: 0, rSum: 0 };
      scoreMap[sc].total++;
      scoreMap[sc].rSum += t.r_multiple || 0;
      if (t.pnl > 0) scoreMap[sc].wins++;
    });
    const scoreData = Object.entries(scoreMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([sc, s]) => ({ sc: `${sc}/7`, wr: winRate(s.wins, s.total), total: s.total, ar: avgR(s.rSum, s.total) }));

    // Layer combos
    const comboMap: Record<string, { wins: number; total: number; rSum: number }> = {};
    trades.forEach(t => {
      const sig = t.signals_at_entry || {};
      const layers = LAYER_KEYS.filter(l => sig[l.key] === 1).map(l => l.label);
      if (!layers.length) return;
      const key = layers.join("+");
      if (!comboMap[key]) comboMap[key] = { wins: 0, total: 0, rSum: 0 };
      comboMap[key].total++;
      comboMap[key].rSum += t.r_multiple || 0;
      if (t.pnl > 0) comboMap[key].wins++;
    });
    const comboStats = Object.entries(comboMap).map(([combo, s]) => ({
      combo, layers: combo.split("+"), ...s,
      wr: winRate(s.wins, s.total), ar: avgR(s.rSum, s.total),
      quality: winRate(s.wins, s.total) * Math.min(1, s.total / 5),
    })).sort((a, b) => b.quality - a.quality).slice(0, 12);

    // Insights
    const insights: { type: "good" | "warn" | "info"; text: string }[] = [];
    if (total >= 5) {
      const bestPair = pairStats[0];
      const worstPair = [...pairStats].sort((a,b) => a.wr - b.wr)[0];
      if (bestPair && bestPair.wr >= 60) insights.push({ type: "good", text: `${bestPair.pair} is your best pair — ${bestPair.wr}% win rate, avg ${bestPair.ar}R` });
      if (worstPair && worstPair.wr <= 30 && worstPair.total >= 3) insights.push({ type: "warn", text: `${worstPair.pair} dragging performance — ${worstPair.wr}% win rate across ${worstPair.total} trades` });
      const longWr = winRate(dirMap.long.wins, dirMap.long.total);
      const shortWr = winRate(dirMap.short.wins, dirMap.short.total);
      if (dirMap.long.total >= 3 && dirMap.short.total >= 3) {
        if (longWr > shortWr + 15) insights.push({ type: "info", text: `Longs outperforming shorts (${longWr}% vs ${shortWr}%) — focus on long setups` });
        else if (shortWr > longWr + 15) insights.push({ type: "info", text: `Shorts outperforming longs (${shortWr}% vs ${longWr}%) — focus on short setups` });
      }
      if (wr < 40 && total >= 10) insights.push({ type: "warn", text: `Win rate ${wr}% is below 40% — consider raising MIN_SIGNAL_SCORE to 5` });
      if (ar < 0 && total >= 5) insights.push({ type: "warn", text: `Average R is negative (${ar}R) — SL exits outweigh profits` });
      const bestCombo = comboStats[0];
      if (bestCombo && bestCombo.wr >= 65 && bestCombo.total >= 3) insights.push({ type: "good", text: `Best combo ${bestCombo.combo} — ${bestCombo.wr}% win rate (${bestCombo.total} trades)` });
    }

    return { total, wins, totalPnl, wr, ar, equity, pairStats, dirMap, exitStats, scoreData, comboStats, insights };
  }, [trades]);

  const equityUp = stats.totalPnl >= 0;

  return (
    <div className="h-screen flex flex-col bg-[#070a10] text-white overflow-hidden">
      <AppHeader />
      <main className="flex-1 overflow-y-auto bg-[#07090f]">

        {/* ── Page Header ─────────────────────────────── */}
        <div className="border-b border-[#1a2030] bg-[#070a10]/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <BarChart2 size={15} className="text-indigo-400" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white">Trade Analytics</h1>
                <p className="text-[10px] text-gray-500">Performance breakdown · signal quality · edge analysis</p>
              </div>
            </div>
            <div className="flex gap-1 bg-[#0d1117] border border-[#1e2433] rounded-lg p-1">
              {(["demo", "live"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
                    mode === m
                      ? m === "live"
                        ? "bg-red-500/20 text-red-300 border border-red-500/40"
                        : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                      : "text-gray-500 hover:text-gray-300"
                  }`}>{m.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-gray-600 text-xs">Loading trades...</span>
            </div>
          </div>
        ) : stats.total === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Activity size={32} className="text-gray-700" />
            <span className="text-gray-600 text-sm">No closed trades in {mode} mode yet</span>
          </div>
        ) : (
          <div className="p-4 space-y-4">

            {/* ── KPI Hero Cards ──────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Total Trades */}
              <div className="relative bg-[#0d1117] border border-[#1e2433] rounded-2xl p-4 overflow-hidden group hover:border-indigo-500/30 transition-all">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total Trades</span>
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                      <Zap size={12} className="text-indigo-400" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-white">{stats.total}</div>
                  <div className="text-[11px] text-gray-600 mt-1">{stats.wins}W · {stats.total - stats.wins}L</div>
                </div>
              </div>

              {/* Win Rate */}
              <div className="relative bg-[#0d1117] border border-[#1e2433] rounded-2xl p-4 overflow-hidden hover:border-green-500/30 transition-all">
                <div className={`absolute inset-0 bg-gradient-to-br ${stats.wr >= 50 ? "from-green-500/5" : "from-red-500/5"} to-transparent`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Win Rate</span>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${stats.wr >= 50 ? "bg-green-500/15" : "bg-red-500/15"}`}>
                      <Target size={12} className={stats.wr >= 50 ? "text-green-400" : "text-red-400"} />
                    </div>
                  </div>
                  <div className={`text-3xl font-black ${stats.wr >= 50 ? "text-green-400" : "text-red-400"}`}>{stats.wr}%</div>
                  <div className="mt-2 h-1.5 bg-[#1a2030] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${stats.wr >= 50 ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${stats.wr}%` }} />
                  </div>
                </div>
              </div>

              {/* Avg R */}
              <div className="relative bg-[#0d1117] border border-[#1e2433] rounded-2xl p-4 overflow-hidden hover:border-purple-500/30 transition-all">
                <div className={`absolute inset-0 bg-gradient-to-br ${stats.ar >= 0 ? "from-purple-500/5" : "from-red-500/5"} to-transparent`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Avg R</span>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${stats.ar >= 0 ? "bg-purple-500/15" : "bg-red-500/15"}`}>
                      <TrendingUp size={12} className={stats.ar >= 0 ? "text-purple-400" : "text-red-400"} />
                    </div>
                  </div>
                  <div className={`text-3xl font-black ${stats.ar >= 0 ? "text-purple-400" : "text-red-400"}`}>
                    {stats.ar >= 0 ? "+" : ""}{stats.ar}R
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">per trade average</div>
                </div>
              </div>

              {/* Total P&L */}
              <div className="relative bg-[#0d1117] border border-[#1e2433] rounded-2xl p-4 overflow-hidden hover:border-yellow-500/20 transition-all">
                <div className={`absolute inset-0 bg-gradient-to-br ${equityUp ? "from-green-500/5" : "from-red-500/5"} to-transparent`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Net P&L</span>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${equityUp ? "bg-green-500/15" : "bg-red-500/15"}`}>
                      {equityUp ? <TrendingUp size={12} className="text-green-400" /> : <TrendingDown size={12} className="text-red-400" />}
                    </div>
                  </div>
                  <div className={`text-2xl font-black ${equityUp ? "text-green-400" : "text-red-400"}`}>
                    {equityUp ? "+" : ""}{fmtINR(stats.totalPnl, 0)}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">after all fees</div>
                </div>
              </div>
            </div>

            {/* ── Equity Curve ────────────────────────────── */}
            <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1e2433] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity size={14} className="text-indigo-400" />
                  <span className="text-sm font-bold text-white">Equity Curve</span>
                </div>
                <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${
                  equityUp ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {equityUp ? "+" : ""}{fmtINR(stats.totalPnl, 0)}
                </span>
              </div>
              <div className="p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.equity} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={equityUp ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={equityUp ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="i" hide />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip fmt={(v: number) => fmtINR(v)} />} />
                    <Area
                      type="monotone" dataKey="pnl"
                      stroke={equityUp ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      fill="url(#pnlGrad)"
                      dot={false} activeDot={{ r: 4, fill: equityUp ? "#22c55e" : "#ef4444" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Insights ────────────────────────────────── */}
            {stats.insights.length > 0 && (
              <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1e2433] flex items-center gap-2.5">
                  <Zap size={13} className="text-yellow-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Smart Insights</span>
                </div>
                <div className="divide-y divide-[#1a2030]">
                  {stats.insights.map((ins, i) => (
                    <div key={i} className={`px-5 py-3 flex items-start gap-3 ${
                      ins.type === "good" ? "hover:bg-green-500/3" :
                      ins.type === "warn" ? "hover:bg-yellow-500/3" : "hover:bg-blue-500/3"
                    }`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        ins.type === "good" ? "bg-green-500/15" :
                        ins.type === "warn" ? "bg-yellow-500/15" : "bg-blue-500/15"
                      }`}>
                        {ins.type === "good" && <CheckCircle size={11} className="text-green-400" />}
                        {ins.type === "warn" && <AlertTriangle size={11} className="text-yellow-400" />}
                        {ins.type === "info" && <Info size={11} className="text-blue-400" />}
                      </div>
                      <span className="text-xs text-gray-300 leading-relaxed">{ins.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Row: Long vs Short + Exit Reasons ───────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Long vs Short */}
              <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1e2433] flex items-center gap-2.5">
                  <TrendingUp size={13} className="text-green-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Long vs Short</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[#1e2433]">
                  {["long", "short"].map(d => {
                    const s = stats.dirMap[d];
                    const wr2 = winRate(s.wins, s.total);
                    const ar2 = avgR(s.rSum, s.total);
                    const isLong = d === "long";
                    return (
                      <div key={d} className="p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isLong ? "bg-green-500/15" : "bg-red-500/15"}`}>
                            {isLong ? <TrendingUp size={13} className="text-green-400" /> : <TrendingDown size={13} className="text-red-400" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white uppercase">{d}</div>
                            <div className="text-[10px] text-gray-600">{s.total} trades</div>
                          </div>
                        </div>
                        {s.total === 0 ? (
                          <span className="text-xs text-gray-600">No trades</span>
                        ) : (
                          <>
                            <div className="mb-1 flex items-end gap-2">
                              <span className={`text-3xl font-black ${wr2 >= 50 ? "text-green-400" : "text-red-400"}`}>{wr2}%</span>
                              <span className="text-gray-600 text-xs mb-1">win rate</span>
                            </div>
                            <div className="h-1.5 bg-[#1a2030] rounded-full overflow-hidden mb-3">
                              <div className={`h-full rounded-full ${wr2 >= 50 ? "bg-green-500" : "bg-red-500"}`}
                                style={{ width: `${wr2}%` }} />
                            </div>
                            <div className={`text-xs font-bold font-mono ${ar2 >= 0 ? "text-purple-400" : "text-red-400"}`}>
                              avg {ar2 >= 0 ? "+" : ""}{ar2}R
                            </div>
                            <div className="text-[10px] text-gray-600 mt-0.5">{s.wins}W · {s.total - s.wins}L</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exit Reasons — donut style */}
              <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1e2433] flex items-center gap-2.5">
                  <Target size={13} className="text-orange-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Exit Breakdown</span>
                </div>
                <div className="p-4 space-y-2.5">
                  {stats.exitStats.map(e => {
                    const pct = Math.round((e.total / stats.total) * 100);
                    const isWin = e.wr >= 50;
                    return (
                      <div key={e.reason}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{e.name}</span>
                            <span className="text-[10px] text-gray-600">{e.total} trades · {pct}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold font-mono ${e.ar >= 0 ? "text-purple-400" : "text-red-400"}`}>
                              {e.ar >= 0 ? "+" : ""}{e.ar}R
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isWin ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                              {e.wr}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1 bg-[#1a2030] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isWin ? "bg-green-500" : e.reason === "sl" ? "bg-red-500" : "bg-orange-500"}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Score vs Win Rate Chart ──────────────────── */}
            {stats.scoreData.length > 0 && (
              <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1e2433] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <BarChart2 size={13} className="text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-widest">Score vs Win Rate</span>
                  </div>
                  <span className="text-[10px] text-gray-600">higher score = better edge?</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {stats.scoreData.map(s => (
                      <div key={s.sc} className={`rounded-xl p-4 border text-center relative overflow-hidden ${
                        s.wr >= 50 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
                      }`}>
                        <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{s.sc} layers</div>
                        <div className={`text-3xl font-black mb-1 ${s.wr >= 50 ? "text-green-400" : "text-red-400"}`}>{s.wr}%</div>
                        <div className="text-[10px] text-gray-600">{s.total} trades</div>
                        <div className={`text-[10px] font-mono font-bold mt-1 ${s.ar >= 0 ? "text-purple-400" : "text-red-400"}`}>
                          {s.ar >= 0 ? "+" : ""}{s.ar}R avg
                        </div>
                        {/* bg bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-0.5">
                          <div className={`h-full ${s.wr >= 50 ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${s.wr}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Pair Performance Table ───────────────────── */}
            <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1e2433] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Trophy size={13} className="text-yellow-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Coin Rankings</span>
                </div>
                <span className="text-[10px] text-gray-600">{stats.pairStats.length} pairs · sorted by P&L</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e2433] text-[10px] uppercase text-gray-600 tracking-wider">
                      <th className="px-5 py-2.5 text-left">#</th>
                      <th className="px-3 py-2.5 text-left">Coin</th>
                      <th className="px-3 py-2.5 text-center">Trades</th>
                      <th className="px-3 py-2.5 text-center">W / L</th>
                      <th className="px-3 py-2.5 text-center">Win %</th>
                      <th className="px-3 py-2.5 text-right">Avg R</th>
                      <th className="px-5 py-2.5 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111827]">
                    {stats.pairStats.map((p, i) => {
                      const isTop3 = i < 3;
                      const rankColors = ["text-yellow-400", "text-gray-300", "text-amber-600"];
                      return (
                        <tr key={p.pair} className="hover:bg-[#111827] transition-colors group">
                          <td className="px-5 py-3">
                            <span className={`text-[11px] font-black ${isTop3 ? rankColors[i] : "text-gray-700"}`}>
                              {isTop3 ? ["🥇","🥈","🥉"][i] : `#${i+1}`}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-bold text-white text-sm">{p.pair}</span>
                          </td>
                          <td className="px-3 py-3 text-center text-gray-400 font-mono">{p.total}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-green-400 font-bold">{p.wins}</span>
                            <span className="text-gray-600 mx-1">/</span>
                            <span className="text-red-400 font-bold">{p.losses}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center gap-1.5 justify-center">
                              <div className="w-12 h-1 bg-[#1a2030] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${p.wr >= 50 ? "bg-green-500" : "bg-red-500"}`}
                                  style={{ width: `${p.wr}%` }} />
                              </div>
                              <span className={`font-bold text-[11px] w-8 ${p.wr >= 50 ? "text-green-400" : "text-red-400"}`}>
                                {p.wr}%
                              </span>
                            </div>
                          </td>
                          <td className={`px-3 py-3 text-right font-mono font-bold ${p.ar >= 0 ? "text-purple-400" : "text-red-400"}`}>
                            {p.ar >= 0 ? "+" : ""}{p.ar}R
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`font-bold font-mono ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {p.pnl >= 0 ? "+" : ""}{fmtINR(p.pnl, 0)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#1e2433] bg-[#080b12]">
                      <td colSpan={2} className="px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total</td>
                      <td className="px-3 py-3 text-center font-bold text-white font-mono">{stats.total}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-green-400 font-bold">{stats.wins}</span>
                        <span className="text-gray-600 mx-1">/</span>
                        <span className="text-red-400 font-bold">{stats.total - stats.wins}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold text-[11px] ${stats.wr >= 50 ? "text-green-400" : "text-red-400"}`}>{stats.wr}%</span>
                      </td>
                      <td className={`px-3 py-3 text-right font-bold font-mono ${stats.ar >= 0 ? "text-purple-400" : "text-red-400"}`}>
                        {stats.ar >= 0 ? "+" : ""}{stats.ar}R
                      </td>
                      <td className={`px-5 py-3 text-right font-bold font-mono ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {stats.totalPnl >= 0 ? "+" : ""}{fmtINR(stats.totalPnl, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Layer Combo Rankings ─────────────────────── */}
            {stats.comboStats.length > 0 && (
              <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1e2433] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Zap size={13} className="text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-widest">Layer Combo Rankings</span>
                  </div>
                  <span className="text-[10px] text-gray-600">best signal combinations</span>
                </div>
                <div className="divide-y divide-[#111827]">
                  {stats.comboStats.map((c, i) => {
                    const rankColors = ["text-yellow-400", "text-gray-300", "text-amber-600"];
                    return (
                      <div key={c.combo} className="px-5 py-3 flex items-center gap-4 hover:bg-[#111827] transition-colors">
                        <span className={`text-[11px] font-black w-6 flex-shrink-0 ${i < 3 ? rankColors[i] : "text-gray-700"}`}>
                          #{i+1}
                        </span>
                        <div className="flex flex-wrap gap-1 w-40 flex-shrink-0">
                          {c.layers.map(l => (
                            <span key={l} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/25 text-indigo-300">
                              {l}
                            </span>
                          ))}
                        </div>
                        <div className="flex-1 hidden sm:block">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-gray-600">{c.total} trades</span>
                            <span className={`text-[10px] font-bold ${c.wr >= 50 ? "text-green-400" : "text-red-400"}`}>{c.wr}%</span>
                          </div>
                          <div className="h-1 bg-[#1a2030] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${c.wr >= 50 ? "bg-green-500" : "bg-red-500"}`}
                              style={{ width: `${c.wr}%` }} />
                          </div>
                        </div>
                        <div className={`text-xs font-bold font-mono w-14 text-right flex-shrink-0 ${c.ar >= 0 ? "text-purple-400" : "text-red-400"}`}>
                          {c.ar >= 0 ? "+" : ""}{c.ar}R
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
