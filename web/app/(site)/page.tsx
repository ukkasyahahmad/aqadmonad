"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AuctionCard } from "@/components/auction-card";
import { Btn, Card, Eyebrow, lotState } from "@/components/kit";
import { GALLERY_LIMIT, useAuctions } from "@/hooks/use-auctions";
import { useChainTime } from "@/hooks/use-chain-time";

const FILTERS = ["All", "Live", "Awaiting settlement", "Settled"] as const;

export default function Home() {
  const { data, isPending, error } = useAuctions();
  const now = useChainTime();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const lots = useMemo(() => {
    const all = data?.lots ?? [];
    if (filter === "All") return all;
    return all.filter((l) => {
      const s = lotState(l.status, l.endTime, now);
      if (filter === "Live") return s === "live" || s === "ending";
      if (filter === "Awaiting settlement") return s === "awaiting";
      return s === "settled";
    });
  }, [data, filter, now]);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-3">
          <Eyebrow>Monad Testnet · real-time auctions</Eyebrow>
          <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-1px] sm:text-[52px] sm:tracking-[-1.8px]">
            Turn anything into a lot.
            <br />
            Auction it live for MON.
          </h1>
          <p className="max-w-xl text-muted-foreground">
            Photograph an item, mint it as an NFT listing, and run a live auction. Outbid bidders get every wei back,
            late bids extend the clock, and anyone can settle when time runs out.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/create"><Btn>Sell an item</Btn></Link>
          <Link href="/host"><Btn variant="secondary">Host console</Btn></Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter auctions">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`h-9 rounded-full border px-4 text-sm font-medium ${filter === f ? "border-foreground bg-foreground text-background" : "border-border-strong bg-card"}`}
          >
            {f}
          </button>
        ))}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.total} auction{data.total === 1 ? "" : "s"} on-chain
            {data.total > GALLERY_LIMIT && ` · showing the latest ${GALLERY_LIMIT}`}
          </span>
        )}
      </div>

      {error ? (
        <Card><p className="text-sm text-warning">Could not reach the Monad RPC. Retrying every 2 seconds…</p></Card>
      ) : isPending ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[440px] animate-pulse rounded-3xl bg-secondary" />
          ))}
        </div>
      ) : lots.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-lg font-semibold">{filter === "All" ? "No auctions yet" : `No ${filter.toLowerCase()} auctions`}</p>
          <p className="max-w-sm text-sm text-muted-foreground">Mint an item and start the first live auction — it takes three transactions.</p>
          <Link href="/create"><Btn>Sell an item</Btn></Link>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {lots.map((l) => <AuctionCard key={l.id.toString()} lot={l} now={now} />)}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["1 · Escrow", "The seller's NFT moves into the AuctionHouse contract when the auction starts."],
          ["2 · Bid & refund", "Each bid must beat the last by 5%. Outbid MON is credited to you and withdrawable any time."],
          ["3 · Settle", "After the deadline anyone can settle: the NFT goes to the winner, MON goes to the seller, atomically."],
        ].map(([t, d]) => (
          <Card key={t}>
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
