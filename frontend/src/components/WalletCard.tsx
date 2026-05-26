import { WalletData } from "@/hooks/useBotSocket";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useExchangeRate } from "@/hooks/useExchangeRate";

interface Props {
  wallet: WalletData | null;
  mode: string;
}

function Stat({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div className="bg-[#0a0d14] rounded-lg p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${
        up === undefined ? "text-white" : up ? "text-green-400" : "text-red-400"
      }`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function WalletCard({ wallet, mode }: Props) {
  const balance   = wallet?.balance ?? 0;
  const initial   = wallet?.initial_balance ?? 100000;
  const totalPnl  = wallet?.total_pnl ?? 0;
  const dailyPnl  = wallet?.daily_pnl ?? 0;
  const totalPct  = wallet?.total_pnl_pct ?? 0;
  const { fmtINR } = useExchangeRate();

  const isDemo = mode === "demo";

  return (
    <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Wallet</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
          isDemo ? "bg-indigo-600/20 text-indigo-400" : "bg-red-600/20 text-red-400"
        }`}>
          {isDemo ? "DEMO" : "LIVE"}
        </span>
      </div>

      {/* Balance */}
      <div className="bg-gradient-to-br from-indigo-900/20 to-[#0a0d14] border border-indigo-500/20 rounded-xl p-4">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Balance</div>
        <div className="text-3xl font-bold text-white font-mono">
          {fmtINR(balance)}
        </div>
        <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${
          totalPnl >= 0 ? "text-green-400" : "text-red-400"
        }`}>
          {totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {totalPnl >= 0 ? "+" : ""}{fmtINR(totalPnl)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%)
          <span className="text-gray-600 text-xs ml-1">total</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Today's P&L"
          value={`${dailyPnl >= 0 ? "+" : ""}${fmtINR(dailyPnl)}`}
          up={dailyPnl >= 0}
        />
        <Stat
          label="Starting"
          value={fmtINR(initial)}
        />
      </div>
    </div>
  );
}
