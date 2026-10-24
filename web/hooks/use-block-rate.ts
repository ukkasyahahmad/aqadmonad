"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

type Sample = { n: bigint; t: number };
const samples: Sample[] = []; // one projector screen per tab; sliding window of ~60 s

/**
 * Average block time measured on this screen: blocks advanced divided by wall-clock time
 * elapsed between 2 s polls. No hard-coded chain constants.
 */
export function useBlockRate() {
  const client = usePublicClient();
  const { data } = useQuery({
    queryKey: ["block-rate"],
    enabled: Boolean(client),
    refetchInterval: 2000,
    queryFn: async () => {
      const n = await client!.getBlockNumber({ cacheTime: 0 });
      const t = performance.now();
      if (!samples.length || samples[samples.length - 1].n !== n) samples.push({ n, t });
      while (samples.length > 2 && t - samples[0].t > 60_000) samples.shift();
      const first = samples[0];
      const blocks = Number(n - first.n);
      return { block: n, avgMs: blocks > 0 ? (t - first.t) / blocks : null };
    },
  });
  return { block: data?.block, avgMs: data?.avgMs ?? null };
}
