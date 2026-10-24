"use client";

import { useEffect, useRef, useState } from "react";
import { createPublicClient, decodeEventLog, encodeEventTopics, webSocket, type Log } from "viem";
import { MONAD_WSS, targetChain } from "@/lib/chain";
import { auctionHouse } from "@/lib/contracts";

export type LiveBid = {
  bidder: `0x${string}`;
  amount: bigint;
  newEndTime: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  seenAt: number; // Date.now() when this screen received it
};

/**
 * Real-time BidPlaced feed over WebSocket. On Monad Testnet it subscribes to `monadLogs`,
 * which publishes logs as soon as a block is Proposed (earlier than standard `logs`); the
 * same log can arrive again as the block advances, so entries are de-duplicated by
 * txHash+logIndex. Returns status "off" when WebSockets are unavailable — callers keep
 * the polling-based history as the source of truth.
 */
export function useLiveBids(id: bigint | null) {
  const [bids, setBids] = useState<LiveBid[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const seen = useRef(new Set<string>());

  const enabled = id !== null && !!auctionHouse;

  useEffect(() => {
    if (!enabled || id === null || !auctionHouse) return;
    const house = auctionHouse;
    const client = createPublicClient({ chain: targetChain, transport: webSocket(MONAD_WSS, { retryCount: 3 }) });
    const topics = encodeEventTopics({ abi: house.abi, eventName: "BidPlaced", args: { id } });
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const onLog = (log: Log) => {
      const key = `${log.transactionHash}-${log.logIndex}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      try {
        const ev = decodeEventLog({ abi: house.abi, eventName: "BidPlaced", data: log.data, topics: log.topics });
        setBids((b) => [
          {
            bidder: ev.args.bidder,
            amount: ev.args.amount,
            newEndTime: BigInt(ev.args.newEndTime),
            blockNumber: BigInt(log.blockNumber ?? 0),
            txHash: log.transactionHash!,
            logIndex: Number(log.logIndex ?? 0),
            seenAt: Date.now(),
          },
          ...b,
        ]);
      } catch {}
    };

    (async () => {
      try {
        const { unsubscribe } = await client.transport.subscribe({
          params: ["monadLogs" as "logs", { address: house.address, topics }],
          onData: (d: { result?: Log } | Log) => onLog(("result" in d && d.result ? d.result : d) as Log),
          onError: () => setStatus("off"),
        });
        if (cancelled) unsubscribe();
        else {
          unsub = unsubscribe;
          setStatus("live");
        }
      } catch {
        setStatus("off");
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
      client.transport.getRpcClient?.().then((c) => c.close()).catch(() => {});
    };
  }, [id, enabled]);

  return { bids, status: enabled ? status : ("off" as const) };
}

