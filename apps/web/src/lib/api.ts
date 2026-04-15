import type {
  Vault,
  VaultListResponse,
  PortfolioResponse,
  VaultFilterParams,
  CompassRequest,
  CompassResponse,
  DepositQuote,
  DepositQuoteError,
  DepositQuoteRequest,
  DepositStatus,
} from "shared";

const BASE = import.meta.env.VITE_WORKER_BASE_URL as string;
const YO_BASE = "https://api.yo.xyz/api/v1";

if (!BASE && import.meta.env.DEV) {
  console.warn("VITE_WORKER_BASE_URL missing — API calls will fail");
}

async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
  return res.json() as Promise<T>;
}

async function externalJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json() as Promise<T>;
}

export function getVaults(filters: VaultFilterParams = {}): Promise<VaultListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null) qs.set(k, `${v as string | number}`);
  }
  return json<VaultListResponse>(`/api/vaults?${qs.toString()}`);
}

export function getVault(slug: string): Promise<Vault> {
  return json<Vault>(`/api/vaults/${encodeURIComponent(slug)}`);
}

export function getPortfolio(address: string): Promise<PortfolioResponse> {
  return json<PortfolioResponse>(`/api/portfolio/${address}`);
}

export async function getDepositQuote(req: DepositQuoteRequest): Promise<DepositQuote> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const res = await fetch(`${BASE}/api/quote?${qs.toString()}`);
  const body = (await res.json()) as DepositQuote | DepositQuoteError;
  if (!res.ok || "error" in body) {
    const err = body as DepositQuoteError;
    const e = new Error(err.message ?? `Quote failed: ${res.status}`);
    (e as Error & { code?: string }).code = err.error;
    throw e;
  }
  return body;
}

export function getDepositStatus(
  txHash: string,
  fromChain: number,
  toChain: number,
): Promise<DepositStatus> {
  const qs = new URLSearchParams({
    txHash,
    fromChain: String(fromChain),
    toChain: String(toChain),
  });
  return json<DepositStatus>(`/api/status?${qs.toString()}`);
}

export async function getCompass(body: CompassRequest): Promise<CompassResponse> {
  const res = await fetch(`${BASE}/api/compass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: /api/compass`);
  return res.json() as Promise<CompassResponse>;
}

/**
 * yo stuff
 */

export type YoNetwork = "base" | "ethereum" | "arbitrum" | "optimism";

export interface YoYieldPoint {
  timestamp: number;
  yield: string;
}

export interface YoTvlPoint {
  timestamp: number;
  tvl: string;
}

interface YoEnvelope<T> {
  data: T[];
  message: string;
  statusCode: number;
}

function normalizeYoNetwork(network: string): YoNetwork {
  const n = network.toLowerCase();

  switch (n) {
    case "base":
      return "base";
    case "ethereum":
    case "mainnet":
      return "ethereum";
    case "arbitrum":
    case "arbitrum one":
      return "arbitrum";
    case "optimism":
      return "optimism";
    default:
      throw new Error(`Unsupported YO network: ${network}`);
  }
}

export async function getYoVaultYieldTimeseries(
  network: string,
  vaultAddress: string,
): Promise<YoYieldPoint[]> {
  const normalizedNetwork = normalizeYoNetwork(network);
  const env = await externalJson<YoEnvelope<YoYieldPoint>>(
    `${YO_BASE}/vault/yield/timeseries/${normalizedNetwork}/${vaultAddress}`,
  );
  return env.data;
}

export async function getYoVaultTvlTimeseries(
  network: string,
  vaultAddress: string,
): Promise<YoTvlPoint[]> {
  const normalizedNetwork = normalizeYoNetwork(network);
  const env = await externalJson<YoEnvelope<YoTvlPoint>>(
    `${YO_BASE}/vault/tvl/timeseries/${normalizedNetwork}/${vaultAddress}`,
  );
  return env.data;
}
