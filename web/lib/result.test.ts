import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { resultFor } from "./result";
import type { Auction } from "./useAuction";

const me = "0x000000000000000000000000000000000000000A" as const;
const other = "0x000000000000000000000000000000000000000b" as const;
const base: Auction = {
  seller: other,
  nft: other,
  tokenId: 1n,
  reserve: 1n,
  minStep: 1n,
  endsAt: 1000,
  buffer: 10,
  topBidder: me.toLowerCase() as `0x${string}`,
  topBid: 5n,
  settled: false,
};

describe("resultFor", () => {
  it("is live before the end", () => {
    expect(resultFor(base, me, false)).toBe("live");
  });
  it("won when I'm the top bidder (case-insensitive)", () => {
    expect(resultFor(base, me, true)).toBe("won");
  });
  it("lost when someone else is top", () => {
    expect(resultFor({ ...base, topBidder: other }, me, true)).toBe("lost");
  });
  it("no-bids when nobody bid", () => {
    expect(resultFor({ ...base, topBidder: zeroAddress, topBid: 0n }, me, true)).toBe("no-bids");
  });
});
