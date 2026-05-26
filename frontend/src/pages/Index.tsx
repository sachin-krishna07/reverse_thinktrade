import { useState } from "react";
import { useBotSocket } from "@/hooks/useBotSocket";
import BotControls from "@/components/BotControls";
import SignalPanel from "@/components/SignalPanel";
import WalletCard from "@/components/WalletCard";
import PositionCard from "@/components/PositionCard";
import PerfStats from "@/components/PerfStats";
import AppHeader from "@/components/AppHeader";
import { Clock, TrendingUp, TrendingDown } from "lucide-react";
import { useExchangeRate } from "@/hooks/useExchangeRate";

function formatSeconds(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Index() {
  const { state, startBot, stopBot, forceClose } = useBotSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { fmtINR } = useExchangeRate();

  const positions = Object.values(state.positions);
  const pos = positions[0] ?? null;

  return (
    <div className="h-screen flex flex-col bg-[#070a10] text-white overflow-hidden">
      <AppHeader
        connected={state.connected}
        running={state.running}
        mode={state.mode}
        style={state.style}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((v) => !v)}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed md:relative inset-y-0 left-0 z-30 md:z-auto
            w-[300px] md:w-80 flex-shrink-0
            flex flex-col gap-4
            border-r border-[#1e2433] bg-[#070a10]
            overflow-y-auto p-4
            transition-transform duration-200 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
            pt-[57px] md:pt-4
          `}
        >
          <BotControls
            running={state.running}
            mode={state.mode}
            style={state.style}
            hasPosition={positions.length > 0}
            onStart={startBot}
            onStop={stopBot}
            onForceClose={forceClose}
          />
          <WalletCard wallet={state.wallet} mode={state.mode} />
          {positions.length > 0
            ? positions.map((p) => (
                <PositionCard key={p.pair} position={p} lastTrade={state.lastTrade} onForceClose={forceClose} />
              ))
            : <PositionCard position={null} lastTrade={state.lastTrade} onForceClose={forceClose} />
          }
          <PerfStats mode={state.mode} />
        </aside>

        {/* Main Panel */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#07090f] min-w-0">
          {/* Signal Monitor header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-white font-semibold text-base leading-tight">Live Signal Monitor</h1>
              <p className="text-gray-500 text-xs mt-0.5">
                7-layer confluence engine · min 4/7 signals required to trade
              </p>
            </div>
            {state.running && (
              <div className="text-xs text-gray-500 bg-[#0d1117] border border-[#1e2433] px-3 py-1.5 rounded-lg flex-shrink-0">
                {Object.keys(state.signals).length > 0
                  ? `${Object.keys(state.signals).length} pairs tracked`
                  : state.pairs.length > 0
                    ? `${state.pairs.length} pairs loading...`
                    : "loading..."}
              </div>
            )}
          </div>

          <SignalPanel
            signals={state.signals}
            selectedPairs={state.running ? undefined : []}
            running={state.running}
            knownPairs={state.pairs}
          />

          {/* Active Trades */}
          <div className="bg-[#0d1117] border border-[#1e2433] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2433]">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active Trades</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                positions.length > 0
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "text-gray-600"
              }`}>
                {positions.length} open
              </span>
            </div>

            {positions.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-700 text-xs">No active trades</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#1a2030] text-[10px] uppercase text-gray-600 tracking-wider">
                      <th className="px-4 py-2 text-left">Pair</th>
                      <th className="px-3 py-2 text-right">P&L</th>
                      <th className="px-3 py-2 text-right">Entry</th>
                      <th className="px-3 py-2 text-right">Current</th>
                      <th className="px-3 py-2 text-right">Stop Loss</th>
                      <th className="px-3 py-2 text-right">Target</th>
                      <th className="px-3 py-2 text-right">Size</th>
                      <th className="px-3 py-2 text-right">R</th>
                      <th className="px-3 py-2 text-right">Time</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111827]">
                    {positions.map((p) => {
                      const isLong = p.direction === "long";
                      const pnlUp  = (p.pnl ?? 0) >= 0;
                      const r      = p.r ?? 0;
                      return (
                        <tr key={p.pair} className={`hover:bg-[#111827] transition-colors ${
                          pnlUp ? "border-l-2 border-l-green-500/30" : "border-l-2 border-l-red-500/30"
                        }`}>
                          {/* Pair + Dir */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                isLong
                                  ? "bg-green-500/10 border-green-500/25 text-green-400"
                                  : "bg-red-500/10 border-red-500/25 text-red-400"
                              }`}>
                                {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                {p.direction?.toUpperCase()}
                              </span>
                              <span className="font-bold text-white text-sm">{p.pair}</span>
                            </div>
                          </td>

                          {/* P&L */}
                          <td className="px-3 py-3 text-right">
                            <div className={`font-bold font-mono text-sm ${pnlUp ? "text-green-400" : "text-red-400"}`}>
                              {pnlUp ? "+" : ""}{fmtINR(p.pnl ?? 0)}
                            </div>
                            <div className={`text-[10px] font-mono ${pnlUp ? "text-green-400/60" : "text-red-400/60"}`}>
                              {(p.pnl_pct ?? 0) >= 0 ? "+" : ""}{p.pnl_pct?.toFixed(2)}%
                            </div>
                          </td>

                          {/* Entry */}
                          <td className="px-3 py-3 text-right font-mono text-gray-300 text-sm">
                            {p.entry?.toFixed(4)}
                          </td>

                          {/* Current */}
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono font-bold text-sm ${pnlUp ? "text-green-400" : "text-red-400"}`}>
                              {p.current?.toFixed(4)}
                            </span>
                          </td>

                          {/* SL */}
                          <td className="px-3 py-3 text-right font-mono text-red-400 text-sm">
                            {p.sl?.toFixed(4)}
                          </td>

                          {/* TP */}
                          <td className="px-3 py-3 text-right font-mono text-yellow-400 text-sm">
                            {p.tp?.toFixed(4)}
                          </td>

                          {/* Size */}
                          <td className="px-3 py-3 text-right font-mono text-indigo-300 text-sm font-bold">
                            {fmtINR(p.size_usd ?? 0, 0)}
                          </td>

                          {/* R */}
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono font-bold text-sm ${r >= 0 ? "text-indigo-400" : "text-red-400"}`}>
                              {r >= 0 ? "+" : ""}{r.toFixed(2)}R
                            </span>
                          </td>

                          {/* Time */}
                          <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">
                            <Clock size={10} className="inline mr-1 mb-0.5" />
                            {formatSeconds(p.elapsed_sec || 0)}
                          </td>

                          {/* Badges */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              {p.trailing_sl && p.breakeven_hit ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-500/25 bg-purple-500/10 text-purple-400 font-bold">TRAIL</span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800/50 text-gray-600 font-bold">OPEN</span>
                              )}
                              {p.profit_locked && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-500/25 bg-green-500/10 text-green-400 font-bold">🔒</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}