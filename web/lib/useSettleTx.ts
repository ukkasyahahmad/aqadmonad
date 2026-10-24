"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { publicClient } from "./chain";
import { AUCTION_ADDRESS, auctionAbi } from "./contracts";

/** Once `settled` turns true, find the settle tx (searching back a few 100-block chunks). */
export function useSettleTx(id: bigint, settled: boolean): Hex | undefined {
  const [hash, setHash] = useState<Hex>();
  useEffect(() => {
    if (!settled || hash) return;
    let stop = false;
    (async () => {
      const head = await publicClient.getBlockNumber();
      for (let i = 0n; i < 20n && !stop; i++) {
        const toBlock = head - i * 100n;
        const logs = await publicClient
          .getContractEvents({
            address: AUCTION_ADDRESS,
            abi: auctionAbi,
            eventName: "Settled",
            args: { id },
            fromBlock: toBlock - 99n,
            toBlock,
          })
          .catch(() => []);
        if (logs[0]) return setHash(logs[0].transactionHash);
      }
    })();
    return () => {
      stop = true;
    };
  }, [id, settled, hash]);
  return hash;
}
