"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc721Abi } from "viem";
import { auctionHouse } from "@/lib/contracts";
import { toAuction, type Auction } from "@/lib/contracts";
import { decodeMetadata, type LotMetadata } from "@/lib/metadata";

export const GALLERY_LIMIT = 24;
const CONCURRENCY = 6;

export type Lot = Auction & { meta: LotMetadata | null; createdAtBlock: bigint };

/** Runs async jobs with a fixed concurrency limit (avoids RPC bursts). */
async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function tokenMeta(client: ReturnType<typeof usePublicClient>, nft: `0x${string}`, tokenId: bigint) {
  try {
    const uri = await client!.readContract({ address: nft, abi: erc721Abi, functionName: "tokenURI", args: [tokenId] });
    return decodeMetadata(uri);
  } catch {
    return null; // NFT without tokenURI support: fall back to generated art
  }
}

export async function fetchLot(client: ReturnType<typeof usePublicClient>, id: bigint): Promise<Lot | null> {
  if (!client || !auctionHouse) return null;
  const [raw, createdAtBlock] = await Promise.all([
    client.readContract({ address: auctionHouse.address, abi: auctionHouse.abi, functionName: "auctions", args: [id] }),
    client.readContract({ address: auctionHouse.address, abi: auctionHouse.abi, functionName: "createdAtBlock", args: [id] }),
  ]);
  const a = toAuction(id, raw);
  if (a.seller === "0x0000000000000000000000000000000000000000") return null; // nonexistent
  return { ...a, createdAtBlock, meta: await tokenMeta(client, a.nft, a.tokenId) };
}

/** Newest-first gallery of the latest GALLERY_LIMIT auctions; refetches every 2 s while visible. */
export function useAuctions() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["auctions", auctionHouse?.address],
    enabled: Boolean(client && auctionHouse),
    refetchInterval: 2000,
    queryFn: async () => {
      const next = await client!.readContract({
        address: auctionHouse!.address,
        abi: auctionHouse!.abi,
        functionName: "nextAuctionId",
      });
      const total = Number(next - 1n);
      const ids: bigint[] = [];
      for (let id = next - 1n; id >= 1n && ids.length < GALLERY_LIMIT; id--) ids.push(id);
      const lots = (await pool(ids, (id) => fetchLot(client, id))).filter((l): l is Lot => l !== null);
      return { total, lots };
    },
  });
}

export function useAuction(id: bigint | null) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["auction", auctionHouse?.address, id?.toString()],
    enabled: Boolean(client && auctionHouse && id !== null),
    refetchInterval: 2000,
    queryFn: () => fetchLot(client, id!),
  });
}
