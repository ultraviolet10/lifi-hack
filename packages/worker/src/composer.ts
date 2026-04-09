import type { Env } from "./index.ts";

export interface QuoteParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  toAddress?: string;
  fromAmount: string;
}

export async function getQuote(params: QuoteParams, env: Env) {
  const url = new URL(`${env.LIFI_API_BASE}/v1/quote`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "x-lifi-api-key": env.COMPOSER_API_KEY },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Composer quote failed (${res.status}): ${body}`);
  }

  return res.json();
}
