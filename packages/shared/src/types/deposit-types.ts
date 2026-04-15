export interface DepositQuoteRequest {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  toAddress?: string;
  fromAmount: string;
  slippage?: number;
  order?: "FASTEST" | "CHEAPEST";
  maxPriceImpact?: number;
}

export interface DepositTransactionRequest {
  from: string;
  to: string;
  chainId: number;
  data: string;
  value?: string;
  gasPrice?: string;
  gasLimit?: string;
}

export interface DepositEstimate {
  approvalAddress: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  executionDuration?: number;
  gasCosts?: Array<{ amountUSD?: string; type?: string }>;
  feeCosts?: Array<{ amountUSD?: string; name?: string }>;
}

export interface DepositQuote {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    toChainId: number;
    fromAmount: string;
    fromAddress: string;
    toAddress: string;
  };
  estimate: DepositEstimate;
  transactionRequest: DepositTransactionRequest;
  includedSteps?: unknown[];
}

export interface DepositQuoteError {
  error: "NO_ROUTE" | "UPSTREAM" | "BAD_REQUEST";
  message: string;
  reasons?: string[];
}

export type DepositStatusValue = "NOT_FOUND" | "PENDING" | "DONE" | "FAILED" | "INVALID";

export type DepositSubstatus =
  | "WAIT_SOURCE_CONFIRMATIONS"
  | "WAIT_DESTINATION_TRANSACTION"
  | "BRIDGE_NOT_AVAILABLE"
  | "CHAIN_NOT_AVAILABLE"
  | "REFUND_IN_PROGRESS"
  | "UNKNOWN_ERROR"
  | "COMPLETED"
  | "PARTIAL"
  | "REFUNDED";

export interface DepositStatus {
  status: DepositStatusValue;
  substatus?: DepositSubstatus;
  substatusMessage?: string;
  sending?: { txHash?: string; txLink?: string; chainId?: number };
  receiving?: { txHash?: string; txLink?: string; chainId?: number; amount?: string };
  lifiExplorerLink?: string;
}
