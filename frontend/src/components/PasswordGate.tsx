import { useState, useEffect, ReactNode } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "tt_auth";
const PASSWORD    = import.meta.env.VITE_APP_PASSWORD || "";

interface Props { children: ReactNode; }

export default function PasswordGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [input,    setInput]    = useState("");
  const [error,    setError]    = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [shake,    setShake]    = useState(false);

  // Check localStorage on mount — skip password screen if already logged in
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      setUnlocked(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#070a10]">
      <div className={`w-full max-w-sm mx-4 ${shake ? "animate-shake" : ""}`}>

        {/* Logo / Title */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <Lock size={24} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <h1 className="text-white font-bold text-xl tracking-tight">ThinkTrade</h1>
            <p className="text-gray-500 text-sm mt-1">Enter password to continue</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              autoFocus
              type={showPw ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Password"
              className={`w-full bg-[#0d1117] border rounded-xl px-4 py-3 pr-11 text-white text-sm outline-none transition-all placeholder:text-gray-600
                ${error
                  ? "border-red-500/60 focus:border-red-500"
                  : "border-[#1e2433] focus:border-indigo-500/60"
                }`}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Error message */}
          <div className={`text-red-400 text-xs text-center transition-opacity duration-300 ${error ? "opacity-100" : "opacity-0"}`}>
            Wrong password — try again
          </div>

          <button
            type="submit"
            disabled={!input}
            className="w-full py-3 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-sm font-semibold
              hover:bg-indigo-500/30 hover:border-indigo-500/60 transition-all
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Unlock
          </button>
        </form>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
