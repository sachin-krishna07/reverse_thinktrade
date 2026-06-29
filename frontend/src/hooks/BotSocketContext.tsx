import { createContext, useContext, ReactNode } from "react";
import { useBotSocket } from "./useBotSocket";

type BotSocketContextType = ReturnType<typeof useBotSocket>;

const BotSocketContext = createContext<BotSocketContextType | null>(null);

export function BotSocketProvider({ children }: { children: ReactNode }) {
  const socket = useBotSocket();
  return (
    <BotSocketContext.Provider value={socket}>
      {children}
    </BotSocketContext.Provider>
  );
}

export function useBotSocketContext(): BotSocketContextType {
  const ctx = useContext(BotSocketContext);
  if (!ctx) throw new Error("useBotSocketContext must be used inside BotSocketProvider");
  return ctx;
}
