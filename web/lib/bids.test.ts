import { describe, expect, it } from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseEther,
} from "viem";
import { auctionAbi } from "./contracts";
import { bidError } from "./bids";

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
