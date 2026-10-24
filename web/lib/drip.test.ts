import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { dripDecision } from "./drip";

const addr = "0x7a3f00000000000000000000000000000000C219";
const base = { address: addr, balanceWei: 0n, dripped: new Set<string>(), count: 0, cap: 60, ipHits: 1 };

describe("dripDecision", () => {
  it("sends to a fresh empty address", () => {
    expect(dripDecision(base)).toBe("send");
  });
  it("never drips the same address twice (case-insensitive)", () => {
    expect(dripDecision({ ...base, dripped: new Set([addr.toLowerCase()]) })).toBe("already");
  });
  it("skips addresses that already have 0.5 MON", () => {
    expect(dripDecision({ ...base, balanceWei: parseEther("0.5") })).toBe("skip-funded");
  });
  it("stops at the global cap", () => {
    expect(dripDecision({ ...base, count: 60, cap: 60 })).toBe("cap");
  });
  it("rate-limits an IP after 5 hits a minute", () => {
    expect(dripDecision({ ...base, ipHits: 6 })).toBe("rate");
  });
  it("rejects a malformed address", () => {
    expect(dripDecision({ ...base, address: "0x123" })).toBe("bad-address");
  });
});
