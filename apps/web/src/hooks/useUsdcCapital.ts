import { useMemo } from "react";
import { mockYieldUsd } from "../lib/mockYield.ts";
import { useWalletUsdc } from "./useWalletUsdc.ts";
import {
  isUnderlyingSymbol,
  usdcPositionUsd,
  useYieldPositions,
  type MatchedPosition,
} from "./useYieldPositions.ts";

export interface UsdcCapital {
  walletUsd: number;
  deployedUsd: number;
  yieldUsd: number;
  principal: number;
  total: number;
  deployedPositions: MatchedPosition[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useUsdcCapital(address: string | undefined): UsdcCapital {
  const wallet = useWalletUsdc(address);
  const positions = useYieldPositions(address);

  const { deployedUsd, yieldUsd, deployedPositions } = useMemo(() => {
    const list = positions.matched.filter((p) => isUnderlyingSymbol(p, "USDC"));
    let d = 0;
    let y = 0;
    for (const p of list) {
      d += usdcPositionUsd(p);
      y += mockYieldUsd(p);
    }
    return { deployedUsd: d, yieldUsd: y, deployedPositions: list };
  }, [positions.matched]);

  const walletUsd = wallet.totalUsd;
  const principal = walletUsd + deployedUsd;

  console.log({ walletUsd, principal });

  return {
    walletUsd,
    deployedUsd,
    yieldUsd,
    principal: walletUsd,
    total: principal + yieldUsd,
    deployedPositions,
    isLoading: wallet.isLoading || positions.isLoading,
    isError: wallet.isError || positions.isError,
    refetch: () => {
      wallet.refetch();
      void positions.refetch();
    },
  };
}
