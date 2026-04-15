import type { Vault } from "shared";
import { useDeposit } from "../hooks/useDeposit.ts";

const LABELS: Record<string, string> = {
  idle: "Deposit 0.2 USDC",
  checking: "Checking balance…",
  quoting: "Getting quote…",
  switching: "Switching chain…",
  approving: "Approving USDC…",
  sending: "Confirm in wallet…",
  "confirming-source": "Confirming…",
  bridging: "Bridging to vault…",
  done: "Deposited ✓",
  failed: "Retry",
};

const CHAIN_NAME: Record<number, string> = { 8453: "Base", 1: "Ethereum" };

export function DepositCard({ vault }: { vault: Vault }) {
  const { state, run, reset } = useDeposit(vault);
  const busy = state.phase !== "idle" && state.phase !== "done" && state.phase !== "failed";

  const onClick = () => {
    if (state.phase === "failed" || state.phase === "done") reset();
    else void run();
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-zinc-300">
          {state.sourceChainId ? (
            <>
              From <span className="text-white">{CHAIN_NAME[state.sourceChainId]}</span>
              {state.sourceChainId !== vault.chainId ? " → bridge" : ""}
            </>
          ) : (
            <>Source: auto-picked from Base / Ethereum</>
          )}
        </div>
        <button
          onClick={onClick}
          disabled={busy}
          className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black disabled:opacity-60"
        >
          {LABELS[state.phase] ?? "Deposit"}
        </button>
      </div>

      {state.substatusMessage && state.phase === "bridging" && (
        <p className="mt-2 text-[11px] text-zinc-400">{state.substatusMessage}</p>
      )}

      {state.phase === "done" && (
        <p className="mt-2 text-[11px] text-emerald-300">
          Deposited 0.20 USDC into {vault.protocol.name}
          {state.partial ? " (partial — check explorer)" : ""}
          {state.lifiExplorerLink ? (
            <>
              {" · "}
              <a
                href={state.lifiExplorerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                explorer
              </a>
            </>
          ) : null}
        </p>
      )}

      {state.phase === "failed" && state.error && (
        <p className="mt-2 text-[11px] text-rose-300">{state.error}</p>
      )}
    </div>
  );
}
