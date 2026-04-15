import type { Env } from "./index.ts";
import type { DepositQuote, DepositQuoteError, DepositStatus } from "shared";

export interface QuoteParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  toAddress?: string;
  fromAmount: string;
  slippage?: string;
  order?: string;
  maxPriceImpact?: string;
  integrator?: string;
}

const QUOTE_DEFAULTS = {
  slippage: "0.005",
  order: "CHEAPEST",
  maxPriceImpact: "0.25",
  integrator: "earnie",
};

export async function getQuote(
  params: QuoteParams,
  env: Env,
): Promise<DepositQuote | DepositQuoteError> {
  const merged: Record<string, string> = { ...QUOTE_DEFAULTS };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") merged[k] = String(v);
  }

  const url = new URL(`${env.LIFI_API_BASE}/v1/quote`);
  for (const [k, v] of Object.entries(merged)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "x-lifi-api-key": env.COMPOSER_API_KEY },
  });

  const text = await res.text();
  if (res.ok) return JSON.parse(text) as DepositQuote;

  // Normalize 404 UnavailableRoutes into structured error
  if (res.status === 404) {
    try {
      const body = JSON.parse(text) as {
        message?: string;
        filteredOut?: Array<{ reason?: string }>;
        failed?: Array<{ reason?: string }>;
      };
      const reasons = [
        ...(body.filteredOut ?? []).map((r) => r.reason).filter(Boolean),
        ...(body.failed ?? []).map((r) => r.reason).filter(Boolean),
      ] as string[];
      return {
        error: "NO_ROUTE",
        message: body.message ?? "No route available",
        reasons: reasons.length ? reasons : undefined,
      };
    } catch {
      // fall through
    }
  }

  return {
    error: res.status === 400 ? "BAD_REQUEST" : "UPSTREAM",
    message: `Composer ${res.status}: ${text.slice(0, 300)}`,
  };
}

export interface StatusParams {
  txHash: string;
  fromChain?: string;
  toChain?: string;
}

export async function getStatus(params: StatusParams, env: Env): Promise<DepositStatus> {
  const url = new URL(`${env.LIFI_API_BASE}/v1/status`);
  url.searchParams.set("txHash", params.txHash);
  if (params.fromChain) url.searchParams.set("fromChain", params.fromChain);
  if (params.toChain) url.searchParams.set("toChain", params.toChain);

  const res = await fetch(url.toString(), {
    headers: { "x-lifi-api-key": env.COMPOSER_API_KEY },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Composer status ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<DepositStatus>;
}
