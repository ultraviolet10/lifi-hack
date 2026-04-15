import type { Vault, VaultListResponse, PortfolioResponse, VaultFilterParams } from "shared";

const BASE = import.meta.env.VITE_WORKER_BASE_URL as string;

if (!BASE && import.meta.env.DEV) {
  console.warn("VITE_WORKER_BASE_URL missing — API calls will fail");
}

async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
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
