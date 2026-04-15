import { erc20Abi, formatUnits, type Address, type ContractFunctionParameters } from "viem";
import { useReadContracts, type UseReadContractsReturnType } from "wagmi";

type ERC20BalanceQueryData = {
  value?: bigint;
  decimals?: number;
  symbol?: string;
  formatted?: string;
};

export type UseERC20BalanceReturnType = UseReadContractsReturnType<
  readonly ContractFunctionParameters[],
  true,
  ERC20BalanceQueryData
>;

export function useERC20Balance(
  assetAddr: Address | undefined,
  userAddr: Address | undefined,
  chainId?: number,
  enableRefetch = false,
): UseERC20BalanceReturnType {
  const tokenContract = {
    address: assetAddr as Address,
    abi: erc20Abi,
    chainId,
  };

  return useReadContracts({
    contracts: [
      { ...tokenContract, functionName: "balanceOf", args: [userAddr as Address] },
      { ...tokenContract, functionName: "decimals" },
      { ...tokenContract, functionName: "symbol" },
    ],
    query: {
      enabled: !!assetAddr && !!userAddr,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: enableRefetch,
      refetchOnMount: enableRefetch,
      select(data): ERC20BalanceQueryData {
        const [balanceResult, decimalsResult, symbolResult] = data;
        const value = balanceResult.result as bigint | undefined;
        const decimals = decimalsResult.result as number | undefined;
        const symbol = symbolResult.result as string | undefined;
        const formatted =
          value !== undefined && decimals !== undefined ? formatUnits(value, decimals) : undefined;
        return { value, decimals, symbol, formatted };
      },
    },
  });
}
