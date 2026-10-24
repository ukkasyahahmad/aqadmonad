import { BaseError, ContractFunctionRevertedError, HttpRequestError, InsufficientFundsError, TimeoutError } from "viem";

export type BidError =
  | { kind: "too-low"; minNext: bigint }
  | { kind: "ended" }
  | { kind: "funds" }
  | { kind: "busy" }
  | { kind: "other"; message: string };

/** Turn a failed bid into something the phone can say in plain words. */
export function bidError(err: unknown): BidError {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName === "BidTooLow") return { kind: "too-low", minNext: revert.data.args?.[0] as bigint };
    if (revert?.data?.errorName === "AuctionEnded") return { kind: "ended" };
    if (err.walk((e) => e instanceof InsufficientFundsError)) return { kind: "funds" };
    const http = err.walk((e) => e instanceof HttpRequestError) as HttpRequestError | null;
    if (http?.status === 429 || err.walk((e) => e instanceof TimeoutError)) return { kind: "busy" };
    return { kind: "other", message: err.shortMessage };
  }
  return { kind: "other", message: err instanceof Error ? err.message : String(err) };
}
