import { useQuery } from "@tanstack/react-query";
import { getPortfolio } from "../lib/api.ts";

export function usePortfolio(address: string | undefined) {
  return useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => getPortfolio(address!),
    enabled: !!address,
  });
}
