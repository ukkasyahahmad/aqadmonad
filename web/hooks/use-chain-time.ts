"use client";

import { useEffect, useState } from "react";
import { useBlock } from "wagmi";

/**
 * Current chain time in seconds: the latest block timestamp, advanced locally once per
 * second. Countdowns use this instead of the browser clock, because contracts compare
 * against block.timestamp (1-second granularity). Returns null until the first block.
 */
export function useChainTime(): number | null {
  const { data: block, dataUpdatedAt } = useBlock({ query: { refetchInterval: 2000 } });
  const [clock, setClock] = useState(0); // 0 until the first tick (no Date.now() during prerender)

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!block) return null;
  // dataUpdatedAt = when this block was fetched; advance from there with the local clock.
  return Number(block.timestamp) + Math.max(0, Math.floor((clock - dataUpdatedAt) / 1000));
}
