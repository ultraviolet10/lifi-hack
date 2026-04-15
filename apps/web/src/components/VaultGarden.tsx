import { useMemo } from "react";
import { useYieldPositions, type MatchedPosition } from "../hooks/useYieldPositions.ts";
import { VaultPlant } from "./VaultPlant.tsx";

const SHOW_MOCK_MORPHO = false;

const MOCK_MORPHO: MatchedPosition = {
  chainId: 8453,
  protocolName: "morpho",
  asset: {
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  balanceUsd: 12.34 as unknown as number,
  balanceNative: "12340000",
  vaultSlug: "mock-morpho-usdc",
  vault: {
    name: "Morpho USDC",
    slug: "mock-morpho-usdc",
    tags: ["stablecoin"],
    address: "0xMOCK000000000000000000000000000000000001",
    chainId: 8453,
    network: "Base",
    lpTokens: [],
    protocol: { url: "https://morpho.org", name: "morpho" },
    provider: "MOCK",
    syncedAt: new Date().toISOString(),
    analytics: {
      apy: { base: 4.5, total: 4.5, reward: 0 },
      tvl: { usd: "5000000" },
      apy1d: 4.5,
      apy7d: 4.4,
      apy30d: 4.6,
      updatedAt: new Date().toISOString(),
    },
    redeemPacks: [],
    depositPacks: [],
    isRedeemable: true,
    isTransactional: true,
    underlyingTokens: [
      {
        symbol: "USDC",
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        decimals: 6,
      },
    ],
  },
};

interface VaultGardenProps {
  address: string | undefined;
}

const MAX_PLANTS = 5;

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SlotPlacement {
  position: MatchedPosition;
  topPct: number;
  leftPct: number;
}

function placePlants(positions: MatchedPosition[]): SlotPlacement[] {
  const limited = positions.slice(0, MAX_PLANTS);
  const seedKey = limited.map((p) => p.vault.address).join("|") || "empty";
  const rand = seededRandom(seedKey);
  const rowHeight = 100 / (limited.length + 1);
  return limited.map((position, i) => {
    const baseTop = rowHeight * (i + 0.5);
    const jitterY = (rand() - 0.5) * 4;
    const jitterX = (rand() - 0.5) * 14;
    return {
      position,
      leftPct: 6 + jitterX,
      topPct: baseTop + jitterY,
    };
  });
}

export function VaultGarden({ address }: VaultGardenProps) {
  const { matched } = useYieldPositions(address);
  const withMock = useMemo(
    () => (SHOW_MOCK_MORPHO ? [MOCK_MORPHO, ...matched] : matched),
    [matched],
  );
  const placements = useMemo(() => placePlants(withMock), [withMock]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {placements.map((p, i) => (
        <div
          key={p.position.vault.slug}
          className="absolute"
          style={{ left: `${p.leftPct}%`, top: `${p.topPct}%` }}
        >
          <VaultPlant position={p.position} delayMs={i * 150} />
        </div>
      ))}
    </div>
  );
}
