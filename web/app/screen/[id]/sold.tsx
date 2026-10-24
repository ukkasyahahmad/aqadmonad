"use client";

import type { Hex } from "viem";
import type { Auction } from "@/lib/useAuction";

/** Big-screen view once the clock has ended. Filled out in Task 9. */
export function Sold(props: { auction: Auction; head?: bigint; bids: number; refunds: number; settledTx?: Hex }) {
  void props;
  return <main className="min-h-screen bg-stage p-12 text-6xl font-bold text-stage-text">Auction ended</main>;
}
