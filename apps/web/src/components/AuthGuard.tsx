import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  if (!ready) return <div className="p-6 text-zinc-400">Loading…</div>;
  if (!authenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}
