import { useQuery } from "@tanstack/react-query";
import { getCompass } from "../lib/api.ts";

export function useCompass(
  address: string | undefined,
  asset: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["compass", address ?? "anon", asset ?? "any"],
    queryFn: () => getCompass({ userAddress: address, asset }),
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
