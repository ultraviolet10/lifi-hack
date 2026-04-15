import { useQuery } from "@tanstack/react-query";
import { getVault } from "../lib/api.ts";

export function useVault(slug: string | undefined) {
  return useQuery({
    queryKey: ["vault", slug],
    queryFn: () => getVault(slug!),
    enabled: !!slug,
  });
}
