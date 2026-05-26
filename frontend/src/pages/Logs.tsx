import { useEffect, useRef, useState } from "react";
import { useBotSocket, LogEntry } from "@/hooks/useBotSocket";
import AppHeader from "@/components/AppHeader";
import { Search, Trash2, ArrowDown, Database, Zap } from "lucide-react";

const API_URL = import.meta.env.VITE_BOT_API_URL || "http://localhost:8000";

const LEVEL_STYLE: Record<string, string> = {
  ERROR:   "text-red-400 bg-red-500/10 border-red-500/30",
  WARNING: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  INFO:    "text-blue-300 bg-blue-500/5 border-blue-500/20",
  DEBUG:   "text-gray-500 bg-transparent border-transparent",
};

const LEVEL_DOT: Record<string, string> = {
  ERROR:   "bg-red-400",
  WARNING: "bg-yellow-400",
  INFO:    "bg-blue-400",
  DEBUG:   "bg-gray-600",
};

const NAME_COLOR: Record<string, string> = {
  trade_engine:   "text-purple-400",
  signal_engine:  "text-indigo-400",
  bot_controller: "text-cyan-400",
  market_data:    "text-teal-400",
  risk_manager:   "text-orange-400",
};

function fmt(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-IN", { hour12: false }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function Logs() {
  const { state } = useBotSocket();
  const [localLogs, setLocalLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [filterName, setFilterName]   = useState<string>("ALL");
  const [search, setSearch]           = useState<string>("");
  const [autoScroll, setAutoScroll]   = useState(true);
  const [source, setSource]           = useState<"db" | "memory">("db");
  const [loading, setLoading]         = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch logs from selected source
  const fetchLogs = (src: "db" | "memory") => {
    setLoading(true);
    fetch(`${API_URL}/api/logs?limit=300&source=${src}`)
      .then((r) => r.json())
      .then((data) => setLocalLogs(data.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(source); }, [source]);

  // Merge WebSocket live logs (always, regardless of source)
  useEffect(() => {
    if (state.logs.length === 0) return;
    const latest = state.logs[state.logs.length - 1];
    setLocalLogs((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].ts === latest.ts) return prev;
      return [...prev.slice(-499), latest];
    });
  }, [state.logs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [localLogs, autoScroll]);

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  // Filter
  const names = Array.from(new Set(localLogs.map((l) => l.name)));
  const filtered = localLogs.filter((l) => {
    if (filterLevel !== "ALL" && l.level !== filterLevel) return false;
    if (filterName !== "ALL" && l.name !== filterName)   return false;
    if (search && !l.msg.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="h-screen flex flex-col bg-[#070a10] text-white overflow-hidden">
      <AppHeader
        connected={state.connected}
        running={state.running}
        mode={state.mode}
        style={state.style}
      />

      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source toggle */}
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#1e2433] rounded-lg p-1">
            <button
              onClick={() => setSource("db")}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                source === "db" ? "bg-indigo-500/20 text-indigo-400" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <Database size={10} /> Supabase
            </button>
            <button
              onClick={() => setSource("memory")}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                source === "memory" ? "bg-green-500/20 text-green-400" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <Zap size={10} /> Live
            </button>
          </div>

          {/* Level filter */}
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#1e2433] rounded-lg p-1">
            {["ALL", "ERROR", "WARNING", "INFO", "DEBUG"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                  filterLevel === lvl
                    ? lvl === "ERROR"   ? "bg-red-500/20 text-red-400"
                    : lvl === "WARNING" ? "bg-yellow-500/20 text-yellow-400"
                    : lvl === "INFO"    ? "bg-blue-500/20 text-blue-400"
                    : lvl === "DEBUG"   ? "bg-gray-700 text-gray-400"
                    : "bg-[#1e2433] text-white"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Component filter */}
          <select
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="text-[11px] bg-[#0d1117] border border-[#1e2433] rounded-lg px-2.5 py-1.5 text-gray-400 outline-none cursor-pointer"
          >
            <option value="ALL">All components</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          {/* Search */}
          <div className="flex items-center gap-1.5 bg-[#0d1117] border border-[#1e2433] rounded-lg px-2.5 py-1.5 flex-1 min-w-[160px]">
            <Search size={12} className="text-gray-600 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="bg-transparent text-[11px] text-gray-300 outline-none w-full placeholder:text-gray-700"
            />
          </div>

          {/* Log count */}
          <span className="text-[11px] text-gray-600 ml-auto">
            {filtered.length}/{localLogs.length} entries
          </span>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
              autoScroll
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-[#1e2433] text-gray-600 hover:text-gray-400"
            }`}
          >
            <ArrowDown size={11} />
            Live
          </button>

          {/* Clear */}
          <button
            onClick={() => setLocalLogs([])}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-[#1e2433] text-gray-600 hover:text-red-400 hover:border-red-500/30 transition-all"
          >
            <Trash2 size={11} />
            Clear
          </button>
        </div>

        {/* Log list */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-[#060810] border border-[#1e2433] rounded-xl font-mono text-[11px] leading-relaxed"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full gap-2 text-gray-600 text-sm">
              <span className="animate-spin w-4 h-4 border-2 border-gray-600 border-t-indigo-400 rounded-full inline-block" />
              Loading from Supabase...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-700 text-sm">
              {localLogs.length === 0
                ? "No logs yet — start the bot to see activity"
                : "No logs match the current filter"}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {filtered.map((l, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#0f1420] hover:bg-white/[0.02] transition-colors ${
                      l.level === "ERROR" ? "bg-red-500/5" : ""
                    }`}
                  >
                    {/* Time */}
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap w-[90px] align-top">
                      {fmt(l.ts)}
                    </td>

                    {/* Level badge */}
                    <td className="px-2 py-1.5 whitespace-nowrap w-[80px] align-top">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${LEVEL_STYLE[l.level] || LEVEL_STYLE.DEBUG}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${LEVEL_DOT[l.level] || "bg-gray-600"}`} />
                        {l.level}
                      </span>
                    </td>

                    {/* Component */}
                    <td className={`px-2 py-1.5 whitespace-nowrap w-[130px] align-top font-semibold ${NAME_COLOR[l.name] || "text-gray-500"}`}>
                      {l.name}
                    </td>

                    {/* Message */}
                    <td className={`px-3 py-1.5 align-top break-all ${
                      l.level === "ERROR"   ? "text-red-300" :
                      l.level === "WARNING" ? "text-yellow-200" :
                                              "text-gray-300"
                    }`}>
                      {l.msg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
