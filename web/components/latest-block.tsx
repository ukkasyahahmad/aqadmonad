"use client";

import { useBlock } from "wagmi";

// Milestone 1 smoke test: reads the latest Monad Testnet block.
// Polls every 2 s; React Query pauses interval polling while the tab is hidden.
export function LatestBlock() {
  const { data, error, isPending } = useBlock({
    query: {
      refetchInterval: 2000,
    },
  });

  if (isPending) return <p className="text-muted-foreground">Reading Monad Testnet…</p>;
  if (error) return <p className="text-destructive">RPC unavailable right now. Retrying…</p>;

  return (
    <dl className="grid grid-cols-2 gap-4 font-mono text-sm">
      <dt className="text-muted-foreground">Latest block</dt>
      <dd className="text-right text-2xl font-semibold tabular-nums">
        {data.number.toString()}
      </dd>
      <dt className="text-muted-foreground">Block timestamp</dt>
      <dd className="text-right tabular-nums">
        {new Date(Number(data.timestamp) * 1000).toLocaleTimeString()}
      </dd>
    </dl>
  );
}
