import { useCallback, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { getAddress, type Address, type Hex } from "viem";
import type { Vault, DepositQuote } from "shared";
import { getDepositQuote, getDepositStatus } from "../lib/api.ts";
import {
  FIXED_AMOUNT,
  USDC,
  SUPPORTED_SOURCE_CHAINS,
  erc20Abi,
  pickSource,
} from "../lib/deposit.ts";

export type DepositPhase =
  | "idle"
  | "checking"
  | "quoting"
  | "switching"
  | "approving"
  | "sending"
  | "confirming-source"
  | "bridging"
  | "done"
  | "failed";

export interface DepositState {
  phase: DepositPhase;
  error?: string;
  errorCode?: string;
  quote?: DepositQuote;
  sourceChainId?: number;
  sourceTxHash?: Hex;
  lifiExplorerLink?: string;
  substatusMessage?: string;
  partial?: boolean;
}

const HEX = (v: string | undefined): Hex | undefined =>
  v === undefined
    ? undefined
    : v.startsWith("0x")
      ? (v as Hex)
      : (`0x${BigInt(v).toString(16)}` as Hex);

export function useDeposit(vault: Vault) {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const basePub = usePublicClient({ chainId: 8453 });
  const mainnetPub = usePublicClient({ chainId: 1 });

  const [state, setState] = useState<DepositState>({ phase: "idle" });
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current || !address) return;
    running.current = true;
    setState({ phase: "checking" });

    try {
      const user = getAddress(address);
      const clients: Record<number, typeof basePub> = { 8453: basePub, 1: mainnetPub };

      // 1. Balances across supported chains
      const balances: Record<number, bigint> = {};
      await Promise.all(
        SUPPORTED_SOURCE_CHAINS.map(async (cid) => {
          const client = clients[cid];
          if (!client) return;
          try {
            const b = (await client.readContract({
              address: USDC[cid],
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [user],
            })) as bigint;
            balances[cid] = b;
          } catch {
            balances[cid] = 0n;
          }
        }),
      );

      const src = pickSource(balances, FIXED_AMOUNT);
      if (!src) {
        setState({
          phase: "failed",
          error: "Need 0.2 USDC on Base or Ethereum",
          errorCode: "INSUFFICIENT_FUNDS",
        });
        return;
      }

      // 2. Quote
      setState({ phase: "quoting", sourceChainId: src.chainId });
      const quote = await getDepositQuote({
        fromChain: src.chainId,
        toChain: vault.chainId,
        fromToken: src.token,
        toToken: vault.address,
        fromAddress: user,
        fromAmount: FIXED_AMOUNT.toString(),
      });

      setState((s) => ({ ...s, phase: "switching", quote }));

      // 3. Switch chain (Privy wallet)
      const wallet = wallets.find((w) => w.address?.toLowerCase() === user.toLowerCase());
      if (!wallet) throw new Error("Wallet not connected");
      if (wallet.chainId !== `eip155:${src.chainId}`) {
        await wallet.switchChain(src.chainId);
      }
      const provider = await wallet.getEthereumProvider();
      const sendTx = async (tx: {
        to: string;
        data: string;
        value?: string;
        gas?: string;
        gasPrice?: string;
      }): Promise<Hex> => {
        const hash = (await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: user, ...tx }],
        })) as Hex;
        return hash;
      };

      // 4. Allowance + approve if short
      const srcClient = clients[src.chainId];
      if (!srcClient) throw new Error(`No RPC for chain ${src.chainId}`);
      const approvalAddress = quote.estimate.approvalAddress as Address;
      const allowance = (await srcClient.readContract({
        address: src.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user, approvalAddress],
      })) as bigint;

      if (allowance < FIXED_AMOUNT) {
        setState((s) => ({ ...s, phase: "approving" }));
        const approveData = encodeApprove(approvalAddress, FIXED_AMOUNT);
        const approveHash = await sendTx({ to: src.token, data: approveData });
        await srcClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 5. Send deposit tx
      setState((s) => ({ ...s, phase: "sending" }));
      const tx = quote.transactionRequest;
      const hash = await sendTx({
        to: tx.to,
        data: tx.data,
        value: HEX(tx.value),
        gas: HEX(tx.gasLimit),
        gasPrice: HEX(tx.gasPrice),
      });

      setState((s) => ({ ...s, phase: "confirming-source", sourceTxHash: hash }));
      await srcClient.waitForTransactionReceipt({ hash });

      // 6. Cross-chain status poll
      if (src.chainId !== vault.chainId) {
        setState((s) => ({ ...s, phase: "bridging" }));
        const done = await pollStatus(hash, src.chainId, vault.chainId, (st) => {
          setState((s) => ({
            ...s,
            substatusMessage: st.substatusMessage,
            lifiExplorerLink: st.lifiExplorerLink,
            partial: st.substatus === "PARTIAL",
          }));
        });
        if (done.status === "FAILED") {
          setState((s) => ({
            ...s,
            phase: "failed",
            error: done.substatusMessage ?? "Bridge failed",
            errorCode: done.substatus,
          }));
          return;
        }
        setState((s) => ({
          ...s,
          phase: "done",
          lifiExplorerLink: done.lifiExplorerLink,
          partial: done.substatus === "PARTIAL",
        }));
      } else {
        setState((s) => ({ ...s, phase: "done" }));
      }

      void queryClient.invalidateQueries({ queryKey: ["portfolio", user] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-usdc", user] });
    } catch (e) {
      const err = e as Error & { code?: string };
      setState({ phase: "failed", error: err.message, errorCode: err.code });
    } finally {
      running.current = false;
    }
  }, [address, vault, wallets, queryClient, basePub, mainnetPub]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, reset };
}

function encodeApprove(spender: Address, amount: bigint): Hex {
  // approve(address,uint256)  selector 0x095ea7b3
  const sp = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const am = amount.toString(16).padStart(64, "0");
  return `0x095ea7b3${sp}${am}` as Hex;
}

async function pollStatus(
  txHash: Hex,
  fromChain: number,
  toChain: number,
  onUpdate: (s: Awaited<ReturnType<typeof getDepositStatus>>) => void,
) {
  const delays = [2000, 3000, 5000, 5000];
  let i = 0;
  // Max ~10 min
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((r) => setTimeout(r, delays[Math.min(i, delays.length - 1)]));
    i++;
    try {
      const st = await getDepositStatus(txHash, fromChain, toChain);
      onUpdate(st);
      if (st.status === "DONE" || st.status === "FAILED") return st;
    } catch {
      // transient — keep polling
    }
  }
  throw new Error("Status polling timed out");
}
