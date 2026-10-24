"use client";

import type { Address } from "viem";
import type { Auction } from "@/lib/useAuction";

/** Phone view once the clock has ended. Filled out in Task 9. */
export function Result(props: { id: bigint; auction: Auction; me?: Address; balance?: bigint }) {
  void props;
  return <main className="p-8 text-center text-2xl font-bold">Auction ended</main>;
}
