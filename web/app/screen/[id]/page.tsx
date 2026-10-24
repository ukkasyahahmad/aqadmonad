"use client";

import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { formatEther, zeroAddress } from "viem";
import { rankBidders } from "@/lib/bids";
import { txUrl } from "@/lib/contracts";
import { nickname } from "@/lib/nickname";
import { formatClock, secondsLeft } from "@/lib/time";
import { useAuction, useNow } from "@/lib/useAuction";
import { useBidFeed } from "@/lib/useBidFeed";
import { cn } from "@/lib/utils";
import { Sold } from "./sold";
import { TopBar, useOrigin } from "@/components/stage";

const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(2);

export default function ScreenPage() {
  const id = BigInt(useParams<{ id: string }>().id);
  const { auction, blockTs, fetchedAt } = useAuction(id);
  const { logs, extendedAt, settledTx, head } = useBidFeed(id);
  const now = useNow();
  const origin = useOrigin();
  const { rows, bids, refunds, locked } = rankBidders(logs);
  const flashing = extendedAt !== undefined && Date.now() - extendedAt < 2000;

  if (!auction || blockTs === undefined || fetchedAt === undefined) {
    return <main className="min-h-screen bg-stage p-12 text-stage-text-2">Loading…</main>;
  }
  const left = secondsLeft(auction.endsAt, blockTs, fetchedAt, now);
  if (left === 0 || auction.settled) {
    return <Sold auction={auction} head={head} bids={bids} refunds={refunds} settledTx={settledTx} />;
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-stage text-stage-text">
      <TopBar label="LIVE" head={head} />
      <div className="flex min-h-0 flex-1">
        <section className="flex flex-1 flex-col justify-between p-12">
          <div className="flex items-center gap-5">
            <div className="size-20 rounded-xl bg-cover bg-center" style={{ backgroundImage: "url(/lot/1.jpg)" }} />
            <div>
              <div className="font-mono text-lg tracking-widest text-stage-text-2">LOT #{auction.tokenId.toString()}</div>
              <div className="text-4xl font-bold tracking-tight">Batik Kawung, hand-drawn</div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <span className="font-mono text-[28vh] leading-none font-semibold tracking-[-0.04em]">{formatClock(left)}</span>
            <div
              className={cn(
                "flex flex-col rounded-2xl bg-accent px-6 py-4 transition-opacity duration-300",
                flashing ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="font-mono text-6xl font-bold">+{auction.buffer} s</span>
              <span className="text-lg">late bid, clock extended</span>
            </div>
          </div>

          <div className="flex items-end justify-between gap-8">
            <div>
              <div className="text-xl text-stage-text-2">{auction.topBid === 0n ? "Starting at" : "Top bid"}</div>
              <div className="flex items-end gap-3">
                <span className="font-mono text-8xl leading-none font-semibold">
                  {mon(auction.topBid === 0n ? auction.reserve : auction.topBid)}
                </span>
                <span className="pb-2 font-mono text-3xl text-stage-text-2">MON</span>
              </div>
              {auction.topBidder !== zeroAddress && (
                <div className="mt-2 text-3xl font-semibold">by {nickname(auction.topBidder)}</div>
              )}
            </div>
            <div className="rounded-2xl border border-stage-line bg-stage-2 px-6 py-4 text-right">
              <div className="font-mono text-5xl font-semibold">{mon(locked)} MON</div>
              <div className="text-lg text-stage-text-2">locked in the contract right now</div>
            </div>
          </div>
        </section>

        <aside className="flex w-[560px] flex-col border-l border-stage-line bg-stage-2">
          <div className="flex items-baseline justify-between px-8 pt-8 pb-4">
            <span className="text-3xl font-bold">Bids</span>
            <span className="font-mono text-lg text-stage-text-2">
              {bids} bids · {refunds} refunds
            </span>
          </div>
          <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-8">
            {rows.length === 0 && <li className="text-xl text-stage-text-2">No bids yet. Reserve {mon(auction.reserve)} MON.</li>}
            {rows.map((r, i) => (
              <li
                key={r.bidder}
                className={cn(
                  "rounded-xl border p-4",
                  i === 0 ? "border-accent bg-accent/15" : "border-stage-line",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-semibold">
                    <span className="mr-3 font-mono text-stage-text-2">{i + 1}</span>
                    {nickname(r.bidder)}
                  </span>
                  <span className="font-mono text-2xl font-semibold">{mon(r.amount)} MON</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-base">
                  <span className={i === 0 ? "font-medium text-[#C9BFFF]" : "text-stage-text-2"}>
                    {r.status === "locked" ? "locked" : "refunded"}
                  </span>
                  <span className="font-mono text-sm text-stage-text-2">
                    block {r.blockNumber.toLocaleString()} ·{" "}
                    <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer" className="underline">
                      tx ↗
                    </a>
                  </span>
                </div>
                {r.refunded > 0n && (
                  <div className="mt-1 text-sm text-stage-text-2">
                    {mon(r.refunded)} MON refunded to {nickname(r.prevBidder)} in the same tx
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-5 border-t border-stage-line p-6">
            {origin && (
              <div className="rounded-lg bg-white p-2">
                <QRCodeSVG value={`${origin}/join`} size={96} />
              </div>
            )}
            <div>
              <div className="text-xl font-semibold">Scan to bid from your phone</div>
              <div className="font-mono text-sm text-stage-text-2">{origin.replace(/^https?:\/\//, "")}/join</div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
