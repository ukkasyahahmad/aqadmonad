"use client";

import { Radio } from "lucide-react";
import { useState } from "react";
import { AuctionView } from "../auction/[id]/auction-view";
import { AuctionCard } from "@/components/auction-card";
import { Card } from "@/components/kit";
import { useAuctions } from "@/hooks/use-auctions";
import { useChainTime } from "@/hooks/use-chain-time";

/**
 * One permanent QR target for the event.
 * - one lot running  → show it (and follow the next one when the host starts it)
 * - several running  → let the viewer pick; their pick stays put while it runs
 * - none running     → keep the most recent lot on screen so winners see their result
 * Each audience screen also has its own per-lot QR, so screens never send people to the wrong lot.
 */
export default function LivePage() {
  const { data, isPending } = useAuctions();
  const now = useChainTime();
  const [picked, setPicked] = useState<string | null>(null);
  const lots = data?.lots ?? []; // newest first
  const running = now === null ? [] : lots.filter((l) => l.status === "Active" && Number(l.endTime) > now);
  const pickedLot = picked ? lots.find((l) => l.id.toString() === picked) : undefined;
  const target = pickedLot ?? (running.length === 1 ? running[0] : running.length === 0 ? lots[0] : undefined);

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm">
        <Radio className="size-4 shrink-0 text-success" />
        {running.length > 1
          ? `${running.length} lots are live right now — pick one to bid.`
          : running.length === 1
            ? "Following the live auction — this page switches to the next lot automatically."
            : "No lot is running right now. Keep this page open: the next one appears here automatically."}
      </p>

      {pickedLot && running.length > 1 && (
        <button onClick={() => setPicked(null)} className="text-sm font-semibold underline underline-offset-4">
          ← See all {running.length} live lots
        </button>
      )}

      {isPending ? (
        <div className="h-[600px] animate-pulse rounded-3xl bg-secondary" />
      ) : target ? (
        <AuctionView key={target.id.toString()} rawId={target.id.toString()} />
      ) : running.length > 1 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {running.map((l) => (
            <div key={l.id.toString()} onClickCapture={(e) => { e.preventDefault(); setPicked(l.id.toString()); }}>
              <AuctionCard lot={l} now={now} />
            </div>
          ))}
        </div>
      ) : (
        <Card className="py-12 text-center text-muted-foreground">No auctions yet. Waiting for the host…</Card>
      )}
    </div>
  );
}
