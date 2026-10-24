"use client";

import { useRef, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  type Abi,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type TransactionReceipt,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { burnerClient } from "@/lib/burner";
import { targetChain } from "@/lib/chain";
import { formatMon } from "@/lib/format";

export type TxPhase = "idle" | "signing" | "confirming" | "success" | "error";

/** Human, calm messages for the contract's custom errors. */
const ERRORS: Record<string, (args: readonly unknown[]) => string> = {
  BidTooLow: (a) => `Someone bid first. The minimum is now ${formatMon(a[1] as bigint)} MON.`,
  AuctionExpired: () => "This auction has already ended.",
  AuctionNotActive: () => "This auction is no longer active.",
  AuctionNotYetEnded: () => "The auction has not reached its end time on-chain yet.",
  SellerCannotBid: () => "You cannot bid on your own auction.",
  AlreadyHighestBidder: () => "You already hold the highest bid from this wallet.",
  AuctionHasBids: () => "Cancellation is no longer possible: a bid has been placed.",
  NotSeller: () => "Only the seller can cancel this auction.",
  NothingToWithdraw: () => "There is nothing to withdraw.",
  TransferFailed: () => "The MON transfer failed. Your balance is unchanged.",
  NotApprovedForTransfer: () => "Approve the NFT for the auction house first.",
  NotTokenOwner: () => "This wallet does not own that token.",
  InvalidNFT: () => "That address is not an ERC-721 contract.",
  ZeroMinPrice: () => "Starting price must be greater than 0 MON.",
  ZeroDuration: () => "Duration must be greater than 0.",
  InvalidURI: () => "Listing details are too long to store on-chain.",
};

/** Name of the contract custom error behind a failure, if any (e.g. "BidTooLow"). */
export function revertName(e: unknown): string | null {
  if (!(e instanceof BaseError)) return null;
  const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
  return r instanceof ContractFunctionRevertedError ? (r.data?.errorName ?? null) : null;
}

export function describeError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && ERRORS[name]) return ERRORS[name](revert.data?.args ?? []);
      if (name) return `The contract rejected this: ${name}.`;
    }
    if (/insufficient funds/i.test(e.message)) return "Not enough MON in this wallet for the amount plus gas.";
    if (/429|rate limit/i.test(e.message)) return "The RPC is busy. Wait a moment and try again.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

/**
 * One write transaction with an explicit lifecycle: signing → confirming (receipt) →
 * success/error. Gas limit = simulated estimate + 10% (Monad bills the gas *limit*).
 *
 * With a `burner` (local key), the transaction is signed in the browser and sent with
 * Monad's eth_sendRawTransactionSync, which returns the receipt in the same RPC call.
 * With a browser wallet, we wait for the receipt by polling every 250 ms.
 */
export function useTx(burner?: PrivateKeyAccount | null) {
  const { address: walletAddress } = useAccount();
  const walletChainId = useChainId();
  const address = burner?.address ?? walletAddress;
  const chainId = burner ? targetChain.id : walletChainId;
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorName, setErrorName] = useState<string | null>(null);
  // Ref mirror so callers can read the failure reason right after `await send()`.
  const lastErrorName = useRef<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [receiptMs, setReceiptMs] = useState<number | null>(null);

  async function send<
    const abi extends Abi,
    fn extends ContractFunctionName<abi, "nonpayable" | "payable">,
  >(params: {
    address: `0x${string}`;
    abi: abi;
    functionName: fn;
    args: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
    value?: bigint;
  }): Promise<TransactionReceipt | null> {
    if (!address || !client) {
      setPhase("error");
      setError("Connect a wallet first.");
      return null;
    }
    if (chainId !== targetChain.id) {
      setPhase("error");
      setError(`Switch your wallet to ${targetChain.name} first.`);
      return null;
    }
    setError(null);
    setErrorName(null);
    lastErrorName.current = null;
    setHash(null);
    setReceiptMs(null);
    setPhase("signing");
    try {
      // Simulate first: surfaces custom errors before the wallet prompt.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = { ...params, account: address } as any;
      await client.simulateContract(p);
      const estimate = await client.estimateContractGas(p);
      const gas = estimate + estimate / 10n;
      if (burner) {
        setPhase("confirming");
        const t0 = performance.now();
        const receipt = await burnerClient(burner).writeContractSync({ ...p, account: burner, gas });
        setReceiptMs(Math.round(performance.now() - t0));
        setHash(receipt.transactionHash);
        if (receipt.status !== "success") {
          setPhase("error");
          setError("The transaction reverted on-chain.");
          return null;
        }
        setPhase("success");
        return receipt;
      }
      const h = await writeContractAsync({ ...p, gas });
      setHash(h);
      setPhase("confirming");
      const t0 = performance.now();
      const receipt = await client.waitForTransactionReceipt({ hash: h, pollingInterval: 250 });
      setReceiptMs(Math.round(performance.now() - t0));
      if (receipt.status !== "success") {
        setPhase("error");
        setError("The transaction reverted on-chain.");
        return null;
      }
      setPhase("success");
      return receipt;
    } catch (e) {
      setPhase("error");
      setError(describeError(e));
      lastErrorName.current = revertName(e);
      setErrorName(lastErrorName.current);
      return null;
    }
  }

  const reset = () => {
    setPhase("idle");
    setError(null);
    setErrorName(null);
    setHash(null);
  };

  return { send, phase, error, errorName, lastErrorName, hash, receiptMs, reset, busy: phase === "signing" || phase === "confirming" };
}
