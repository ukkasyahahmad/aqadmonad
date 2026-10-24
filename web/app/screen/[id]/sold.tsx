"use client";

import { formatEther, zeroAddress, type Hex } from "viem";
import { txUrl } from "@/lib/contracts";
import { nickname } from "@/lib/nickname";
import type { Auction } from "@/lib/useAuction";
import { TopBar } from "@/components/stage";

const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(2);

/** Big-screen view once the clock has ended: waiting for settle, then SOLD. */
export function Sold({
  auction,
  head,
  bids,
  refunds,
  settledTx,
}: {
  auction: Auction;
  head?: bigint;
  bids: number;
  refunds: number;
  settledTx?: Hex;
}) {
  const noBids = auction.topBidder === zeroAddress;
  const sold = auction.settled;
  const winner = noBids ? "" : nickname(auction.topBidder);

  return (
    <main className="flex h-screen flex-col bg-stage text-stage-text">
      <TopBar label={sold ? "SOLD" : "ENDED"} head={head} />
      <section className="flex flex-1 items-center gap-16 px-16">
        <div className="size-[44vh] shrink-0 rounded-3xl bg-cover bg-center" style={{ backgroundImage: "url(/lot/1.jpg)" }} />
        <div className="flex flex-col gap-6">
          {noBids ? (
            <>
              <div className="text-6xl font-bold">No bids this time</div>
              <div className="text-2xl text-stage-text-2">
                {sold ? "The NFT went back to the seller." : "Waiting for the seller to settle."}
              </div>
            </>
          ) : (
            <>
              <div className="text-3xl text-stage-text-2">
                Lot #{auction.tokenId.toString()} {sold ? "sold to" : "goes to"}
              </div>
              <div className="text-8xl font-bold tracking-tight">{winner}</div>
              <div className="flex items-end gap-3">
                <span className="font-mono text-8xl leading-none font-semibold">{mon(auction.topBid)}</span>
                <span className="pb-2 font-mono text-3xl text-stage-text-2">MON</span>
              </div>
              <div className="flex gap-10 font-mono text-2xl">
                <span>
                  <b className="text-4xl">{bids}</b> <span className="text-stage-text-2">bids</span>
                </span>
                <span>
                  <b className="text-4xl">{refunds}</b> <span className="text-stage-text-2">refunds</span>
                </span>
              </div>
              <div className="max-w-3xl text-2xl text-stage-text-2">
                {sold
                  ? `One transaction moved the NFT to ${winner} and ${mon(auction.topBid)} MON to the seller.`
                  : "Waiting for the seller to settle: one transaction will move the NFT and the MON."}
              </div>
            </>
          )}
          {settledTx && (
            <a href={txUrl(settledTx)} target="_blank" rel="noreferrer" className="font-mono text-xl text-[#C9BFFF] underline">
              settle tx {settledTx.slice(0, 6)}…{settledTx.slice(-4)} ↗ testnet.monadvision.com
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
