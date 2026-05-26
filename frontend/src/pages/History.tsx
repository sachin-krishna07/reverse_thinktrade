import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import TradeHistory from "@/components/TradeHistory";

export default function History() {
  const [mode, setMode] = useState<"demo" | "live">("demo");

  return (
    <div className="h-screen flex flex-col bg-[#070a10] text-white overflow-hidden">
      <AppHeader />

      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#07090f]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-white font-semibold text-base">Trade History</h1>
            <p className="text-gray-500 text-xs mt-0.5">All completed trades</p>
          </div>
          <div className="flex gap-1.5 bg-[#0d1117] border border-[#1e2433] rounded-lg p-1">
            {(["demo", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  mode === m
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <TradeHistory mode={mode} />
      </main>
    </div>
  );
}
