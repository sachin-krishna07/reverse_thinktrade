import { useLocation, Link } from "react-router-dom";
import { Wifi, WifiOff, LayoutDashboard, BarChart2, History, Terminal, Menu, X, Activity } from "lucide-react";

interface Props {
  connected?: boolean;
  running?: boolean;
  mode?: string;
  style?: string;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
}

const TABS = [
  { path: "/",          label: "Dashboard", icon: LayoutDashboard },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/history",   label: "History",   icon: History },
  { path: "/logs",      label: "Logs",      icon: Terminal },
];

export default function AppHeader({
  connected, running, mode, style, sidebarOpen, onSidebarToggle,
}: Props) {
  const { pathname } = useLocation();

  return (
    <header className="flex-shrink-0 z-30" style={{ background: "linear-gradient(180deg, #060910 0%, #070c15 100%)", borderBottom: "1px solid #1a2235" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 md:px-8" style={{ height: "64px" }}>

        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-4">
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}

          {/* Logo + brand */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-16 h-12 rounded-xl overflow-hidden flex items-center justify-center"
                >
                <img
                  src="/think_trade_logo.png"
                  alt="ThinkTrade"
                  className="w-19 h-19 object-contain"
                />
              </div>
            </div>

            <div className="flex flex-col leading-none">
              <span className="text-white text-xl" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "-0.01em" }}>
                ThinkTrade
              </span>
              <span className="text-[10px] font-medium hidden sm:block"
                style={{ color: "#4f6a9a", letterSpacing: "0.12em" }}>
                CRYPTO AUTOBOT
              </span>
            </div>
          </div>
        </div>

        {/* Right: status area */}
        <div className="flex items-center gap-3">

          {/* Connection pill */}
          {connected !== undefined && (
            <div className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
              connected
                ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                : "text-red-400 bg-red-500/10 border border-red-500/20"
            }`}>
              {connected
                ? <Wifi size={12} />
                : <WifiOff size={12} />}
              <span>{connected ? "Connected" : "Offline"}</span>
            </div>
          )}

          {/* Bot status pill */}
          {running !== undefined && (
            <div className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full transition-all ${
              running
                ? "text-emerald-300 border border-emerald-500/30"
                : "text-gray-500 border border-white/5"
            }`}
              style={running ? {
                background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.06) 100%)",
                boxShadow: "0 0 20px rgba(16,185,129,0.15)"
              } : {
                background: "rgba(255,255,255,0.03)"
              }}>

              {running ? (
                <>
                  <Activity size={12} className="animate-pulse" />
                  <span className="hidden sm:inline tracking-widest">
                    {mode?.toUpperCase()} · {style?.toUpperCase()}
                  </span>
                  <span className="sm:hidden">LIVE</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                  <span>STOPPED</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex px-5 md:px-8" style={{ borderTop: "1px solid #111827" }}>
        {TABS.map((tab) => {
          const active = pathname === tab.path;
          const Icon   = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`relative flex items-center gap-2 px-5 py-3 text-xs font-semibold transition-all ${
                active
                  ? "text-indigo-400"
                  : "text-gray-600 hover:text-gray-300"
              }`}
            >
              <Icon size={13} />
              {tab.label}
              {/* Active underline with glow */}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: "linear-gradient(90deg, transparent, #6366f1, transparent)", boxShadow: "0 0 8px #6366f1" }} />
              )}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
