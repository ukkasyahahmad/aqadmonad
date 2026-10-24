"use client";

import { useEffect, useRef, useState } from "react";
import { createPublicClient, webSocket, type Hex, type Log } from "viem";
import { monadTestnet, publicClient, wsUrl } from "./chain";
import { AUCTION_ADDRESS, auctionAbi } from "./contracts";
import { logRanges } from "./logs";
import type { BidLog } from "./bids";

const MAX_BACKFILL = 3000n; // ~20 min of Monad blocks; an auction screen never needs more

type Decoded = Log & { eventName?: string; args?: Record<string, unknown> };

/**
 * Live event feed for one auction, for the big screen.
 * Backfills past events (in 100-block chunks), then listens over wss for low latency and
 * also polls getLogs every 500 ms as the fallback. Duplicates are fine: rankBidders dedupes.
 */
export function useBidFeed(id: bigint) {
  const [logs, setLogs] = useState<BidLog[]>([]);
  const [extendedAt, setExtendedAt] = useState<number>();
  const [settledTx, setSettledTx] = useState<Hex>();
  const [head, setHead] = useState<bigint>();
  const seenExtended = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    let from: bigint | undefined;

    const ingest = (raw: Decoded[]) => {
      const mine = raw.filter((l) => (l.args as { id?: bigint } | undefined)?.id === id);
      const bids: BidLog[] = [];
      for (const l of mine) {
        if (l.eventName === "BidPlaced") {
          const a = l.args as { bidder: Hex; amount: bigint; endsAt: bigint; prevBidder: Hex; refunded: bigint };
          bids.push({
            bidder: a.bidder,
            amount: a.amount,
            endsAt: Number(a.endsAt),
            prevBidder: a.prevBidder,
            refunded: a.refunded,
            txHash: l.transactionHash!,
            logIndex: l.logIndex!,
            blockNumber: l.blockNumber!,
          });
        } else if (l.eventName === "Extended") {
          const key = `${l.transactionHash}:${l.logIndex}`;
          if (!seenExtended.current.has(key)) {
            seenExtended.current.add(key);
            if (from !== undefined) setExtendedAt(Date.now()); // flash only for live events
          }
        } else if (l.eventName === "Settled") {
          setSettledTx(l.transactionHash!);
        }
      }
      if (bids.length) setLogs((prev) => [...prev, ...bids]);
    };

    const fetchRange = (fromBlock: bigint, toBlock: bigint) =>
      publicClient.getContractEvents({ address: AUCTION_ADDRESS, abi: auctionAbi, fromBlock, toBlock }) as Promise<Decoded[]>;

    (async () => {
      // Backfill: walk back from the head until we find this auction's AuctionCreated.
      const latest = await publicClient.getBlockNumber();
      const floor = latest > MAX_BACKFILL ? latest - MAX_BACKFILL : 0n;
      const chunks = logRanges(floor, latest).reverse();
      const found: Decoded[] = [];
      for (const [a, b] of chunks) {
        if (stop) return;
        const evs = await fetchRange(a, b).catch(() => [] as Decoded[]);
        found.push(...evs);
        if (evs.some((e) => e.eventName === "AuctionCreated" && (e.args as { id?: bigint })?.id === id)) break;
      }
      ingest(found);
      from = latest + 1n;
      setHead(latest);

      // Fallback poll every 500 ms.
      while (!stop) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const now = await publicClient.getBlockNumber();
          setHead(now);
          const start: bigint = from;
          if (now >= start) {
            const to: bigint = now - start > 99n ? start + 99n : now;
            ingest(await fetchRange(start, to));
            from = to + 1n;
          }
        } catch {
          // rate limited or offline: try again next tick
        }
      }
    })();

    // Live: websocket subscription for the lowest latency.
    let unwatch: (() => void) | undefined;
    try {
      const ws = createPublicClient({ chain: monadTestnet, transport: webSocket(wsUrl) });
      unwatch = ws.watchContractEvent({
        address: AUCTION_ADDRESS,
        abi: auctionAbi,
        onLogs: (l) => from !== undefined && ingest(l as Decoded[]),
        onError: () => {},
      });
    } catch {
      // no websocket: polling above still runs
    }

    return () => {
      stop = true;
      unwatch?.();
    };
  }, [id]);

  return { logs, extendedAt, settledTx, head };
}
