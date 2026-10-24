"use client";

import { formatEther, type Address } from "viem";
import { ArrowUpRight } from "lucide-react";
import { txUrl } from "@/lib/contracts";
import { nickname } from "@/lib/nickname";
import { resultFor } from "@/lib/result";
import type { Auction } from "@/lib/useAuction";
import { useSettleTx } from "@/lib/useSettleTx";
import { Card, Chip } from "@/components/ui-bits";

const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(2);

/** Phone view once the clock has ended. */
export function Result({ id, auction, me, balance }: { id: bigint; auction: Auction; me?: Address; balance?: bigint }) {
  const outcome = resultFor(auction, me, true);
  const settleTx = useSettleTx(id, auction.settled);

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col gap-6 px-5 pt-4 pb-8">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-bold tracking-tight">Aqad Lelang</span>
        <span className="font-mono text-xs text-text-2">Auction ended</span>
      </header>

      <section className="flex flex-col gap-2.5 pt-3">
        {outcome === "won" && (
          <>
            <Chip>Highest bid</Chip>
            <h1 className="text-6xl font-bold tracking-tight">You won</h1>
            <p className="text-text-2">
              Batik Kawung is yours for {mon(auction.topBid)} MON.{" "}
              {auction.settled ? "The NFT is in your wallet." : "The seller will settle in a moment."}
            </p>
          </>
        )}
        {outcome === "lost" && (
          <>
            <Chip tone="grey">Refunded</Chip>
            <h1 className="text-4xl font-bold tracking-tight">All your MON is back</h1>
            <p className="text-text-2">
              {nickname(auction.topBidder)} placed the highest bid at {mon(auction.topBid)} MON. Every bid you made was
              refunded the moment you were outbid.
            </p>
          </>
        )}
        {outcome === "no-bids" && (
          <>
            <h1 className="text-4xl font-bold tracking-tight">No bids this time</h1>
            <p className="text-text-2">Nothing was spent. The NFT goes back to the seller.</p>
          </>
        )}
      </section>

      <Card className="flex items-center gap-4 p-4">
        <div className="size-16 rounded-xl bg-cover bg-center" style={{ backgroundImage: "url(/lot/1.jpg)" }} />
        <div className="flex flex-1 flex-col">
          <span className="font-semibold">
            Batik Kawung → {outcome === "won" ? "you" : outcome === "lost" ? nickname(auction.topBidder) : "seller"}
          </span>
          <span className="font-mono text-xs text-text-2">LotNFT #{auction.tokenId.toString()}</span>
        </div>
        {outcome !== "no-bids" && (
          <div className="text-right">
            <div className="font-mono font-semibold">{mon(auction.topBid)} MON</div>
            <div className="text-xs text-text-2">final price</div>
          </div>
        )}
      </Card>

      {balance !== undefined && <p className="text-center font-mono text-sm text-text-2">Balance {mon(balance)} MON</p>}

      {settleTx && (
        <a
          className="flex items-center justify-center gap-1 font-mono text-xs text-accent"
          href={txUrl(settleTx)}
          target="_blank"
          rel="noreferrer"
        >
          View settle tx on MonadVision <ArrowUpRight className="size-3" />
        </a>
      )}
    </main>
  );
}
