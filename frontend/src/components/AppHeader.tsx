import { useLocation, Link } from "react-router-dom";
import { Wifi, WifiOff, LayoutDashboard, BarChart2, History, Terminal, Menu, X } from "lucide-react";

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
    <header className="flex-shrink-0 border-b border-[#1e2433] bg-[#070a10] z-30">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        {/* Left: logo + mobile menu */}
        <div className="flex items-center gap-3">
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
            T
          </div>
          <div>
            <span className="font-bold text-white tracking-tight">ThinkTrade</span>
            <span className="text-gray-500 text-xs ml-2 hidden sm:inline">Crypto AutoBot</span>
          </div>
        </div>

        {/* Right: status badges */}
        <div className="flex items-center gap-3">
          {connected !== undefined && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-green-400" : "text-red-400"}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span className="hidden sm:inline">{connected ? "Connected" : "Offline"}</span>
            </div>
          )}
          {running !== undefined && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-medium transition-all ${
              running
                ? "border-green-500/40 bg-green-500/10 text-green-400"
                : "border-[#1e2433] bg-[#0d1117] text-gray-600"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${running ? "bg-green-400 animate-pulse" : "bg-gray-700"}`} />
              <span className="hidden sm:inline">
                {running ? `LIVE · ${mode?.toUpperCase()} · ${style?.toUpperCase()}` : "STOPPED"}
              </span>
              <span className="sm:hidden">{running ? "LIVE" : "OFF"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex border-t border-[#1e2433] px-4 md:px-6">
        {TABS.map((tab) => {
          const active = pathname === tab.path;
          const Icon   = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                active
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
