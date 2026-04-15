import { useAccount } from "wagmi";
import type { Address } from "viem";
import { useERC20Balance } from "./useERC20Balance.ts";
import { USDC_BY_CHAIN } from "../lib/deposit.ts";

export interface WalletUsdc {
  totalUsd: number;
  chainId: number | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useWalletUsdc(address: string | undefined): WalletUsdc {
  const { chain } = useAccount();
  const token = chain ? USDC_BY_CHAIN[chain.id] : undefined;
  const bal = useERC20Balance(token, address as Address | undefined, chain?.id, true);

  const value = bal.data?.value;
  const decimals = bal.data?.decimals;
  const totalUsd =
    value !== undefined && decimals !== undefined ? Number(value) / 10 ** decimals : 0;
  // console.log({totalUsd,
  //   chainId: chain?.id,
  //   isLoading: bal.isLoading,
  //   isError: bal.isError,})

  return {
    totalUsd,
    chainId: chain?.id,
    isLoading: bal.isLoading,
    isError: bal.isError,
    refetch: () => {
      void bal.refetch();
    },
  };
}
