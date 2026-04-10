import { z } from "zod";

export const ProtocolSchema = z.object({
  url: z.string(),
  name: z.string(),
});

export const UnderlyingTokenSchema = z.object({
  symbol: z.string(),
  address: z.string(),
  decimals: z.number(),
});

export const AnalyticsSchema = z.object({
  apy: z.object({
    base: z.number().nullable(),
    total: z.number().nullable(),
    reward: z.number().nullable(),
  }),
  tvl: z.object({
    usd: z.string(),
  }),
  apy1d: z.number().nullable(),
  apy7d: z.number().nullable(),
  apy30d: z.number().nullable(),
  updatedAt: z.string(),
});

export const VaultSchema = z.object({
  name: z.string(),
  slug: z.string(),
  tags: z.array(z.string()),
  address: z.string(),
  chainId: z.number(),
  network: z.string(),
  lpTokens: z.array(z.string()),
  protocol: ProtocolSchema,
  provider: z.string(),
  syncedAt: z.string(),
  analytics: AnalyticsSchema,
  redeemPacks: z.array(z.object({ name: z.string(), stepsType: z.string() })),
  depositPacks: z.array(z.object({ name: z.string(), stepsType: z.string() })),
  isRedeemable: z.boolean(),
  isTransactional: z.boolean(),
  underlyingTokens: z.array(UnderlyingTokenSchema),
});

export type Vault = z.infer<typeof VaultSchema>;

export const VaultListResponseSchema = z.object({
  data: z.array(VaultSchema),
  nextCursor: z.string().nullable().optional(),
  total: z.number(),
});

export type VaultListResponse = z.infer<typeof VaultListResponseSchema>;

export const PortfolioPositionSchema = z.object({
  chainId: z.number(),
  protocolName: z.string(),
  asset: z.object({
    address: z.string(),
    name: z.string(),
    symbol: z.string(),
    decimals: z.number(),
  }),
  balanceUsd: z.number(),
  balanceNative: z.string(),
});

export type PortfolioPosition = z.infer<typeof PortfolioPositionSchema>;

export const PortfolioResponseSchema = z.object({
  positions: z.array(PortfolioPositionSchema),
});

export type PortfolioResponse = z.infer<typeof PortfolioResponseSchema>;
