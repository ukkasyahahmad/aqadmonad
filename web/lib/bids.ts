import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  type Address,
  type Hex,
} from "viem";

export type BidLog = {
  bidder: Address;
  amount: bigint;
  endsAt: number;
  prevBidder: Address;
  refunded: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
};

export type RankRow = Omit<BidLog, "endsAt" | "logIndex"> & { status: "locked" | "refunded" };

/**
 * The big-screen leaderboard: one row per bidder at their best bid, highest first.
 * Only the top row's MON is still in the contract; everyone below was refunded.
 * Logs can arrive twice (websocket + polling), so dedupe by tx + log index first.
 */
export function rankBidders(logs: BidLog[]): { rows: RankRow[]; bids: number; refunds: number; locked: bigint } {
  const unique = [...new Map(logs.map((l) => [`${l.txHash}:${l.logIndex}`, l])).values()];
  const best = new Map<string, BidLog>();
  for (const l of unique) {
    const key = l.bidder.toLowerCase();
    const cur = best.get(key);
    if (!cur || l.amount > cur.amount) best.set(key, l);
  }
  const rows = [...best.values()]
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    .map(({ bidder, amount, prevBidder, refunded, txHash, blockNumber }, i) => ({
      bidder,
      amount,
      prevBidder,
      refunded,
      txHash,
      blockNumber,
      status: i === 0 ? ("locked" as const) : ("refunded" as const),
    }));
  return {
    rows,
    bids: unique.length,
    refunds: unique.filter((l) => l.refunded > 0n).length,
    locked: rows[0]?.amount ?? 0n,
  };
}

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
