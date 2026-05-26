import { SignalData } from "@/hooks/useBotSocket";

interface Props {
  signals: Record<string, SignalData>;
  selectedPairs?: string[];
  running?: boolean;
  knownPairs?: string[];
}

const LAYERS = [
  { key: "trend_regime",    label: "L1 Trend ",    weight: "MANDATORY" },
  { key: "cvd_divergence",  label: "L2 CVD Divergence",  weight: "HIGH"      },
  { key: "vwap_deviation",  label: "L3 VWAP Deviation",  weight: "MEDIUM"    },
  { key: "dom_imbalance",   label: "L4 DOM Imbalance",   weight: "MEDIUM"    },
  { key: "rsi2_extreme",    label: "L5 RSI Extreme",     weight: "MEDIUM"    },
  { key: "liquidity_sweep", label: "L6 Liq Sweep",       weight: "HIGH"      },
  { key: "fair_value_gap",  label: "L7 Fair Value Gap",  weight: "HIGH"      },
];

const WEIGHT_COLOR: Record<string, string> = {
  MANDATORY: "text-yellow-400",
  HIGH:      "text-orange-400",
  MEDIUM:    "text-blue-400",
};

function fmt(n: number | undefined, dec = 2) {
  if (n === undefined || n === null) return "—";
  return Number(n).toFixed(dec);
}

function LayerDetail({ sig, layer }: { sig: SignalData; layer: typeof LAYERS[0] }) {
  const val = (sig as any)[layer.key];
  const active = val === 1;

  let detail = "";
  switch (layer.key) {
    case "trend_regime":
      detail = active
        ? `${sig.trend_direction?.toUpperCase()} · ADX:${fmt(sig.adx_value, 1)}`
        : `RANGING · ADX:${fmt(sig.adx_value, 1)}`;
      break;
    case "cvd_divergence":
      detail = `CVD: ${fmt(sig.cvd_value, 0)}`;
      break;
    case "vwap_deviation":
      detail = `VWAP: ${fmt(sig.vwap_value, 2)} · Dev: ${fmt(sig.vwap_dev_pct, 3)}%`;
      break;
    case "dom_imbalance":
      detail = `Ratio: ${fmt(sig.dom_ratio, 2)}:1`;
      break;
    case "rsi2_extreme":
      detail = `RSI: ${fmt(sig.rsi2_value, 1)}`;
      break;
    case "liquidity_sweep":
      detail = active ? `${sig.sweep_type?.toUpperCase()} sweep` : "No sweep";
      break;
    case "fair_value_gap":
      detail = active ? `${sig.fvg_type?.toUpperCase()} gap @ ${fmt(sig.fvg_level, 2)}` : "No FVG";
      break;
    case "ema_pullback":
      detail = active ? "Price at EMA-9 pullback zone" : "Waiting for pullback to EMA-9";
      break;
  }

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#1e2433]">
      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        active ? "bg-green-500/20 text-green-400" : "bg-red-500/10 text-red-500/60"
      }`}>
        {active ? "✓" : "✗"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-white">{layer.label}</span>
          <span className={`text-[9px] font-bold ${WEIGHT_COLOR[layer.weight]}`}>
            {layer.weight}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 truncate block">{detail}</span>
      </div>
    </div>
  );
}

function PairSignalCard({ pair, sig }: { pair: string; sig?: SignalData }) {
  if (!sig) {
    return (
      <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-bold">{pair}</span>
          <span className="text-gray-600 text-xs">Waiting for data...</span>
        </div>
        <div className="space-y-1">
          {LAYERS.map((l) => (
            <div key={l.key} className="h-7 bg-[#1a2035] rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const score      = sig.total_score || 0;
  const dir        = sig.signal_direction || "none";
  const canTrade   = score >= 4 && sig.trend_regime === 1;

  const dirColor =
    dir === "long"  ? "text-green-400 bg-green-500/10" :
    dir === "short" ? "text-red-400 bg-red-500/10"     :
                      "text-gray-500 bg-gray-700/20";

  const scoreColor =
    score >= 6 ? "text-green-400" :
    score >= 4 ? "text-yellow-400" :
                 "text-gray-500";

  return (
    <div className={`bg-[#0f1117] border rounded-xl p-4 transition-all ${
      canTrade ? "border-green-500/50 shadow-[0_0_16px_rgba(34,197,94,0.15)]" :
                 "border-[#1e2433]"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">{pair}/USDT</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${dirColor}`}>
            {dir === "none" ? "NEUTRAL" : dir.toUpperCase()}
          </span>
        </div>
        <div className="text-right">
          <div className={`text-base font-bold ${scoreColor}`}>{score}/7</div>
          <div className="text-[9px] text-gray-600">signals</div>
        </div>
      </div>

      {/* Price + ATR */}
      <div className="flex gap-3 mb-3 text-xs">
        <div>
          <span className="text-gray-500">Price </span>
          <span className="text-white font-mono">${fmt(sig.price, sig.price > 100 ? 2 : 4)}</span>
        </div>
        <div>
          <span className="text-gray-500">ATR </span>
          <span className="text-gray-300 font-mono">{fmt(sig.atr_value, sig.atr_value > 10 ? 1 : 4)}</span>
        </div>
      </div>

      {/* Signal bar — 7 layers */}
      <div className="mb-3">
        <div className="flex gap-0.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-sm ${
              i < score
                ? score >= 6 ? "bg-green-400" : score >= 4 ? "bg-yellow-400" : "bg-gray-600"
                : "bg-[#1e2433]"
            }`} />
          ))}
        </div>
        <div className="mt-0.5">
          <span className="text-[9px] text-gray-600">{score}/7 layers</span>
        </div>
      </div>

      {/* Layers */}
      <div className="grid grid-cols-2 gap-x-2">
        {LAYERS.map((l) => (
          <LayerDetail key={l.key} sig={sig} layer={l} />
        ))}
      </div>

      {/* Execution gate status */}
      {score >= 4 && sig.trend_regime === 1 && (
        <div className="mt-3 space-y-1.5">
          {/* BTC bias badge */}
          {sig.btc_bias && sig.btc_bias !== "n/a" && (
            <div className="flex gap-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                sig.btc_bias === dir
                  ? "bg-green-500/10 border-green-500/25 text-green-400"
                  : "bg-red-500/10 border-red-500/25 text-red-400"
              }`}>
                BTC {sig.btc_bias === dir ? "✓" : "✗"}
              </span>
            </div>
          )}

          {/* Final status banner */}
          {sig.trade_signal ? (
            <div className="flex items-center justify-center gap-2 py-2 rounded-lg
                            bg-green-500/10 border border-green-500/40 text-green-400 text-xs font-bold">
              ● ENTRY SIGNAL — {dir.toUpperCase()} {score}/7
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-1.5 rounded-lg
                            bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-semibold">
              ⚠ SIGNAL BLOCKED
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SignalPanel({ signals, selectedPairs, running, knownPairs }: Props) {
  const signalPairs = selectedPairs?.length ? selectedPairs : Object.keys(signals);

  // Bot is running but signals haven't arrived yet — show skeleton cards for known pairs
  // or a generic loading spinner if we don't know pairs yet
  if (running && signalPairs.length === 0) {
    const skeletonPairs = knownPairs && knownPairs.length > 0 ? knownPairs : null;
    if (skeletonPairs) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {skeletonPairs.map((p) => (
            <PairSignalCard key={p} pair={p} sig={undefined} />
          ))}
        </div>
      );
    }
    return (
      <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl p-8 text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-blue-400 text-sm font-medium">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
          Loading market data...
        </div>
        <p className="text-gray-600 text-xs">Signals will appear automatically in a few seconds</p>
      </div>
    );
  }

  if (signalPairs.length === 0) {
    return (
      <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl p-8 text-center text-gray-500 text-sm">
        Start the bot to see live signals
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {signalPairs.map((p) => (
        <PairSignalCard key={p} pair={p} sig={signals[p]} />
      ))}
    </div>
  );
}
