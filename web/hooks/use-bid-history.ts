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
 * The cursor only advances when every window succeeds, so a failed refresh is retried whole.
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
      // Each window is one ~0.6 s round trip, so fetch this refresh's windows in parallel.
      const ranges: [bigint, bigint][] = [];
      for (let from = s.cursor; from <= latest && ranges.length < MAX_WINDOWS_PER_REFRESH; from += LOG_RANGE) {
        ranges.push([from, from + LOG_RANGE - 1n < latest ? from + LOG_RANGE - 1n : latest]);
      }
      const results = await Promise.all(
        ranges.map(([fromBlock, toBlock]) =>
          client!.getLogs({ address: auctionHouse!.address, event: BidPlaced, args: { id: id! }, fromBlock, toBlock }),
        ),
      );
      for (const l of results.flat()) {
        s.bids.push({
          bidder: l.args.bidder!,
          amount: l.args.amount!,
          newEndTime: l.args.newEndTime!,
          blockNumber: l.blockNumber,
          txHash: l.transactionHash,
          logIndex: l.logIndex,
        });
      }
      if (ranges.length) s.cursor = ranges[ranges.length - 1][1] + 1n;
      const newestFirst = [...s.bids].sort((a, b) =>
        a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber < b.blockNumber ? 1 : -1,
      );
      return { bids: newestFirst, syncing: s.cursor <= latest, latest };
    },
  });
}
