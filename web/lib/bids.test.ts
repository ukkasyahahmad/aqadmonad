import { describe, expect, it } from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseEther,
} from "viem";
import { auctionAbi } from "./contracts";
import { bidError, rankBidders, type BidLog } from "./bids";

const A = "0x000000000000000000000000000000000000000a" as const;
const B = "0x000000000000000000000000000000000000000b" as const;
const Z = "0x0000000000000000000000000000000000000000" as const;
const log = (bidder: `0x${string}`, amount: string, prevBidder: `0x${string}`, refunded: string, n: number): BidLog => ({
  bidder,
  amount: parseEther(amount),
  endsAt: 1000,
  prevBidder,
  refunded: parseEther(refunded),
  txHash: `0x${n.toString(16).padStart(64, "0")}`,
  logIndex: 0,
  blockNumber: BigInt(n),
});

describe("rankBidders", () => {
  it("merges repeat bidders, ranks by best bid, tags locked/refunded, dedupes", () => {
    const a1 = log(A, "0.05", Z, "0", 1);
    const b1 = log(B, "0.06", A, "0.05", 2);
    const a2 = log(A, "0.07", B, "0.06", 3);
    const r = rankBidders([a1, b1, a2, { ...a2 }]);
    expect(r.rows.map((x) => [x.bidder, x.amount, x.status])).toEqual([
      [A, parseEther("0.07"), "locked"],
      [B, parseEther("0.06"), "refunded"],
    ]);
    expect(r.bids).toBe(3);
    expect(r.refunds).toBe(2);
    expect(r.locked).toBe(parseEther("0.07"));
  });
  it("handles no bids", () => {
    expect(rankBidders([])).toEqual({ rows: [], bids: 0, refunds: 0, locked: 0n });
  });
});

function reverted(errorName: "BidTooLow" | "AuctionEnded", args?: readonly [bigint]) {
  const data = encodeErrorResult({ abi: auctionAbi, errorName, args } as Parameters<typeof encodeErrorResult>[0]);
  const cause = new ContractFunctionRevertedError({ abi: auctionAbi, data, functionName: "bid" });
  return new ContractFunctionExecutionError(cause, { abi: auctionAbi, functionName: "bid", args: [1n] });
}

describe("bidError", () => {
  it("decodes BidTooLow with the new minimum", () => {
    expect(bidError(reverted("BidTooLow", [parseEther("0.15")]))).toEqual({
      kind: "too-low",
      minNext: 150000000000000000n,
    });
  });
  it("decodes AuctionEnded", () => {
    expect(bidError(reverted("AuctionEnded"))).toEqual({ kind: "ended" });
  });
  it("passes other errors through with their message", () => {
    expect(bidError(new Error("boom"))).toEqual({ kind: "other", message: "boom" });
  });
});
