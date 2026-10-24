"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { LOG_RANGE } from "@/lib/chain";
import { auctionHouse } from "@/lib/contracts";

const BidPlaced = parseAbiItem(
  "event BidPlaced(uint256 indexed id, address indexed bidder, uint256 amount, uint64 newEndTime)",
);
/** At most this many 100-block windows are scanned per refresh (bounded RPC load). */
const MAX_WINDOWS_PER_REFRESH = 20;

export type BidEvent = {
  bidder: `0x${string}`;
  amount: bigint;
  newEndTime: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
};

/**
 * BidPlaced logs for one auction, read in ≤100-block windows (Monad RPC limit) from the
 * auction's creation block. Keeps a cursor so each 2 s refresh only scans new blocks.
 */
export function useBidHistory(id: bigint | null, fromBlock: bigint | undefined) {
  const client = usePublicClient();
  const state = useRef<{ key: string; cursor: bigint; bids: BidEvent[] } | null>(null);
  const key = `${auctionHouse?.address}:${id}`;

  return useQuery({
    queryKey: ["bids", key, fromBlock?.toString()],
    enabled: Boolean(client && auctionHouse && id !== null && fromBlock !== undefined),
    refetchInterval: 2000,
    queryFn: async () => {
      if (state.current?.key !== key) state.current = { key, cursor: fromBlock!, bids: [] };
      const s = state.current;
      const latest = await client!.getBlockNumber();
      let windows = 0;
      while (s.cursor <= latest && windows < MAX_WINDOWS_PER_REFRESH) {
        const to = s.cursor + LOG_RANGE - 1n < latest ? s.cursor + LOG_RANGE - 1n : latest;
        const logs = await client!.getLogs({
          address: auctionHouse!.address,
          event: BidPlaced,
          args: { id: id! },
          fromBlock: s.cursor,
          toBlock: to,
        });
        for (const l of logs) {
          s.bids.push({
            bidder: l.args.bidder!,
            amount: l.args.amount!,
            newEndTime: l.args.newEndTime!,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
            logIndex: l.logIndex,
          });
        }
        s.cursor = to + 1n;
        windows++;
      }
      const newestFirst = [...s.bids].sort((a, b) =>
        a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber < b.blockNumber ? 1 : -1,
      );
      return { bids: newestFirst, syncing: s.cursor <= latest, latest };
    },
  });
}
