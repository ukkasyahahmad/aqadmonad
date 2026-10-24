"use client";

import { useEffect, useState } from "react";
import { publicClient } from "./chain";
import { AUCTION_ADDRESS, auctionAbi } from "./contracts";

/** Id of the newest auction (polled every 1 s), or undefined while none exists yet. */
export function useLatestAuction(): bigint | undefined {
  const [id, setId] = useState<bigint>();
  useEffect(() => {
    const tick = () =>
      publicClient
        .readContract({ address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "lastId" })
        .then((v) => setId(v === 0n ? undefined : v))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return id;
}
