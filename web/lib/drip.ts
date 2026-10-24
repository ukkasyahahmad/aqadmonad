import { isAddress, parseEther } from "viem";

export type DripDecision = "send" | "skip-funded" | "already" | "cap" | "rate" | "bad-address";

/** Decide whether /api/drip should send 1 test MON. Pure, so it's easy to test. */
export function dripDecision(s: {
  address: string;
  balanceWei: bigint;
  dripped: Set<string>;
  count: number;
  cap: number;
  ipHits: number;
}): DripDecision {
  if (!isAddress(s.address, { strict: false })) return "bad-address";
  if (s.dripped.has(s.address.toLowerCase())) return "already";
  if (s.balanceWei >= parseEther("0.5")) return "skip-funded";
  if (s.count >= s.cap) return "cap";
  if (s.ipHits > 5) return "rate";
  return "send";
}
