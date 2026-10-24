import Link from "next/link";
import { formatCountdown, formatMon, shortAddr } from "@/lib/format";
import type { Lot } from "@/hooks/use-auctions";
import { lotState, StatePill } from "./kit";
import { NftArt } from "./nft-art";
import { WatchButton } from "./watch-button";

export function lotTitle(l: Pick<Lot, "meta" | "tokenId">) {
  return l.meta?.name ?? `Demo NFT #${l.tokenId}`;
}

export function AuctionCard({ lot, now }: { lot: Lot; now: number | null }) {
  const state = lotState(lot.status, lot.endTime, now);
  const hasBid = lot.highestBid > 0n;
  const left = now === null ? null : Number(lot.endTime) - now;
  return (
    <Link
      href={`/auction/${lot.id}`}
      className="group flex flex-col rounded-3xl border border-border bg-card p-3 shadow-[0_1px_2px_#1018140A] transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <NftArt tokenId={lot.tokenId} image={lot.meta?.image} alt={lotTitle(lot)} />
        <div className="absolute left-2 top-2">
          <StatePill state={state} />
        </div>
        <WatchButton id={lot.id} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Auction #{lot.id.toString()} · {lot.meta?.category ?? "NFT"} · Token #{lot.tokenId.toString()}
        </p>
        <h3 className="line-clamp-2 min-h-[2.5em] text-[17px] font-semibold leading-tight">{lotTitle(lot)}</h3>
        <p className="text-xs text-muted-foreground">Seller <span className="font-mono">{shortAddr(lot.seller)}</span></p>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{hasBid ? "Highest bid" : "Starting price"}</p>
            <p className="font-mono text-[15px] font-semibold">{formatMon(hasBid ? lot.highestBid : lot.minPrice)} MON</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{state === "live" || state === "ending" ? "Ends in" : "Status"}</p>
            <p className="font-mono text-[15px] font-semibold">
              {state === "live" || state === "ending"
                ? formatCountdown(left ?? 0)
                : state === "awaiting"
                  ? "Expired"
                  : state === "settled"
                    ? "Sold"
                    : "—"}
            </p>
          </div>
        </div>
        <span className="mt-3 inline-flex h-11 items-center justify-center rounded-xl border border-border-strong text-sm font-semibold group-hover:bg-secondary">
          View auction
        </span>
      </div>
    </Link>
  );
}
