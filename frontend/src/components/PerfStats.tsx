import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useExchangeRate } from "@/hooks/useExchangeRate";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface Props { mode: string; }

interface Perf {
  trades_total: number;
  trades_won: number;
  win_rate: number;
  total_pnl: number;
  avg_r: number;
  best_trade: number;
  worst_trade: number;
}

function Tile({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-[#0a0d14] rounded-lg p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color || "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600">{sub}</div>}
    </div>
  );
}

export default function PerfStats({ mode }: Props) {
  const [perf, setPerf] = useState<Perf | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("performance").select("*").eq("mode", mode)
        .eq("date", today).limit(1);
      if (data?.[0]) setPerf(data[0] as Perf);
    };
    fetch();
    const ch = supabase.channel("perf_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "performance" }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mode]);

  const { fmtINR } = useExchangeRate();
  const winRate = perf?.win_rate ?? 0;
  const winColor =
    winRate >= 60 ? "text-green-400" :
    winRate >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl p-4 space-y-3">
      <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Today's Performance</h2>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Win Rate"
          value={perf ? `${winRate.toFixed(1)}%` : "—"}
          sub={perf ? `${perf.trades_won}W / ${(perf.trades_total - perf.trades_won)}L` : ""}
          color={perf ? winColor : undefined} />
        <Tile label="Total Trades"
          value={perf ? `${perf.trades_total}` : "—"}
          color="text-white" />
        <Tile label="Total P&L"
          value={perf ? `${perf.total_pnl >= 0 ? "+" : ""}${fmtINR(perf.total_pnl ?? 0, 0)}` : "—"}
          color={perf ? (perf.total_pnl >= 0 ? "text-green-400" : "text-red-400") : undefined} />
        <Tile label="Avg R-Multiple"
          value={perf ? `${perf.avg_r >= 0 ? "+" : ""}${perf.avg_r?.toFixed(2)}R` : "—"}
          color={perf ? (perf.avg_r >= 0 ? "text-green-400" : "text-red-400") : undefined} />
        <Tile label="Best Trade"
          value={perf?.best_trade ? `+${fmtINR(perf.best_trade ?? 0, 0)}` : "—"}
          color="text-green-400" />
        <Tile label="Worst Trade"
          value={perf?.worst_trade ? `${fmtINR(perf.worst_trade ?? 0, 0)}` : "—"}
          color="text-red-400" />
      </div>
    </div>
  );
}
