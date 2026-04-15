import { useQuery } from "@tanstack/react-query";
import type { VaultFilterParams } from "shared";
import { getVaults } from "../lib/api.ts";

export function useVaults(filters: VaultFilterParams = {}) {
  return useQuery({
    queryKey: ["vaults", filters],
    queryFn: () => getVaults(filters),
  });
}
