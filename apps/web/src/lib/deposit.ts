import { erc20Abi, type Address } from "viem";

export const FIXED_AMOUNT = 200_000n; // 0.2 USDC (6 decimals)

export const USDC: Record<number, Address> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum mainnet
};

export const SUPPORTED_SOURCE_CHAINS = [8453, 1] as const;

// Canonical USDC addresses across chains where MetaMask may be connected.
// Wallet-balance read path only — deposit flow still uses USDC/SUPPORTED_SOURCE_CHAINS above.
export const USDC_BY_CHAIN: Record<number, Address> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

export { erc20Abi };

export function pickSource(
  balances: Record<number, bigint>,
  min: bigint,
): { chainId: number; token: Address } | null {
  for (const chainId of SUPPORTED_SOURCE_CHAINS) {
    if ((balances[chainId] ?? 0n) >= min) return { chainId, token: USDC[chainId] };
  }
  return null;
}
