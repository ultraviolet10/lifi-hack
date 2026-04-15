import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import hero from "../assets/hero.png";

export function Onboard() {
  const { ready, authenticated, login } = usePrivy();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && authenticated) void navigate("/discover", { replace: true });
  }, [ready, authenticated, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <img src={hero} alt="" className="w-40 h-40 object-contain mb-8 opacity-90" />
      <h1 className="text-5xl font-semibold tracking-tight mb-3">Earnie</h1>
      <p className="text-zinc-400 max-w-sm mb-10">
        Pocket-sized DeFi yields. Pick a vault, earn a rate, done.
      </p>
      <button
        onClick={login}
        disabled={!ready}
        className="px-8 py-3 rounded-xl bg-(--color-brand) font-medium hover:opacity-90 disabled:opacity-50"
      >
        Log in with wallet
      </button>
    </div>
  );
}
