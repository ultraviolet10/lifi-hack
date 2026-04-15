import { useState } from "react";
import { Cuer } from "cuer";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { useERC20Balance } from "../hooks/useERC20Balance.ts";
import { YieldBalance } from "../components/YieldBalance.tsx";
import { EarnieSheet } from "../components/EarnieSheet.tsx";
import { usePortfolio } from "../hooks/usePortfolio.ts";
import { mockYieldUsd } from "../lib/mockYield.ts";

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

function Row({
  label,
  right,
  open,
  onToggle,
  children,
}: {
  label: string;
  right?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="font-display text-lg text-zinc-100">{label}</span>
        <div className="flex items-center gap-3">
          {right}
          <span className="text-zinc-500">[{open ? "−" : "+"}]</span>
        </div>
      </button>
      {open && <div className="pb-5 text-sm text-zinc-300">{children}</div>}
    </div>
  );
}

function splitAddress(addr: string) {
  const body = addr.slice(2);
  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += 8) chunks.push(body.slice(i, i + 8));
  return chunks;
}

export function Experiment() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { address, chain } = useAccount();
  const eth = useBalance({ address });
  console.log("eth balance", eth.data, eth.status, eth.error, "chain:", chain?.id);
  const usdcAddr = chain ? USDC_BY_CHAIN[chain.id] : undefined;
  const usdc = useERC20Balance(usdcAddr, address, chain?.id);
  console.log("usdc balance", usdc.data, usdc.status, usdc.error);

  const [open, setOpen] = useState<string | null>("assets");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const portfolio = usePortfolio(address);
  const usdcPositions = (portfolio.data?.positions ?? []).filter(
    (p) => p.asset.symbol.toUpperCase() === "USDC",
  );
  const usdcPrincipal = usdcPositions.reduce((s, p) => s + p.balanceUsd, 0);
  const usdcYield = usdcPositions.reduce((s, p) => s + mockYieldUsd(p), 0);
  const fallbackPrincipal = Number(usdc.data?.formatted ?? 0);

  if (!ready) return <div className="p-6 text-zinc-400">Loading…</div>;

  if (!authenticated || !address) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <button onClick={login} className="rounded-full bg-blue-500 px-6 py-3 text-white">
          Sign in with MetaMask
        </button>
      </div>
    );
  }

  const addrChunks = splitAddress(address);

  return (
    <div className="experiment-theme flex min-h-screen bg-black text-white">
      {/* Left brand panel */}
      <aside className="relative hidden w-[40%] flex-col justify-between overflow-hidden bg-blue-600 p-10 md:flex">
        <div className="absolute right-10 top-20 opacity-40">
          <div className="mb-6 h-28 w-28 rounded-full bg-blue-400/60" />
          <div className="mb-4 h-16 w-56 rounded-2xl bg-blue-400/60" />
          <div className="mb-4 h-12 w-56 rounded-2xl bg-blue-400/50" />
          <div className="h-10 w-56 rounded-2xl bg-blue-400/40" />
        </div>
        <div />
        <div>
          <h1 className="font-display text-5xl font-medium">Earnie</h1>
          <p className="mt-3 max-w-xs text-blue-100">A home for your digital assets.</p>
          <div className="mt-10 flex gap-4 text-sm text-blue-200">
            <a href="#">Documentation</a>
            <span>·</span>
            <a href="#">Support</a>
          </div>
        </div>
      </aside>

      {/* Right account panel */}
      <main className="flex-1 p-10">
        <div className="mb-10 flex justify-end gap-3">
          <button className="rounded-full bg-blue-500 px-4 py-2 text-sm">Add funds</button>
          <button className="rounded-full px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">
            Help
          </button>
          <button onClick={logout} className="rounded-full bg-red-600 px-4 py-2 text-sm">
            Sign out
          </button>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="mb-10 flex items-center justify-between">
            <p className="text-sm text-zinc-500">Your account</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }}
                className="relative grid size-32 shrink-0 cursor-pointer place-items-center rounded-2xl border-2 border-dotted border-earnie-pink text-left font-mono text-xs leading-5 text-zinc-400 transition-colors duration-150 ease-[ease] [@media(hover:hover)]:hover:bg-earnie-pink/50 motion-reduce:transition-none"
              >
                <span
                  className={`col-start-1 row-start-1 transition-opacity duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none ${copied ? "opacity-0" : "opacity-100"}`}
                >
                  {addrChunks.map((c, i) => (
                    <div key={i}>{c}</div>
                  ))}
                </span>
                <span
                  className={`col-start-1 row-start-1 text-sm text-white transition-opacity duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none ${copied ? "opacity-100" : "opacity-0"}`}
                >
                  copied!
                </span>
              </button>
              <div className="size-32 shrink-0 rounded-2xl bg-white p-2">
                <Cuer.Root value={address} color="black">
                  <Cuer.Finder radius={0} />
                  <Cuer.Cells radius={0} />
                </Cuer.Root>
              </div>
            </div>
          </div>

          <Row
            label="Assets"
            open={open === "assets"}
            onToggle={() => setOpen(open === "assets" ? null : "assets")}
          >
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span>ETH</span>
                <span>{eth.data ? formatUnits(eth.data.value, eth.data.decimals) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>USDC</span>
                <YieldBalance
                  principal={usdcPrincipal || fallbackPrincipal}
                  yieldAmount={usdcYield}
                  onClick={() => setSheetOpen(true)}
                />
              </div>
            </div>
          </Row>

          <Row
            label="Permissions"
            open={open === "permissions"}
            onToggle={() => setOpen(open === "permissions" ? null : "permissions")}
          >
            <p className="text-zinc-500">No permissions granted.</p>
          </Row>
        </div>
      </main>
      <EarnieSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
