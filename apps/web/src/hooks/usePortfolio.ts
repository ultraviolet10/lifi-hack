import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { PortfolioResponse } from "shared";
import { getPortfolio } from "../lib/api.ts";

const STALE_MS = 30_000;
const REFETCH_MS = 60_000;

export function usePortfolio(address: string | undefined) {
  return useQuery<PortfolioResponse>({
    queryKey: ["portfolio", address],
    queryFn: () => getPortfolio(address!),
    enabled: !!address,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useInvalidatePortfolio() {
  const qc = useQueryClient();
  return useCallback(
    (address?: string) => {
      void qc.invalidateQueries({
        queryKey: address ? ["portfolio", address] : ["portfolio"],
      });
    },
    [qc],
  );
}
