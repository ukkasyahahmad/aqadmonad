"use client";

import { ChevronLeft, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { lotTitle } from "@/components/auction-card";
import { BidHistory } from "@/components/bid-history";
import { BidPanel } from "@/components/bid-panel";
import { Card, Eyebrow, lotState } from "@/components/kit";
import { NftArt } from "@/components/nft-art";
import { AuctionQr, QrFullscreenButton } from "@/components/qr";
import { WatchButton } from "@/components/watch-button";
import { useAuction } from "@/hooks/use-auctions";
import { useBidHistory } from "@/hooks/use-bid-history";
import { useChainTime } from "@/hooks/use-chain-time";
import { explorerAddress, targetChain } from "@/lib/chain";
import { auctionHouse } from "@/lib/contracts";
import { formatCountdown, formatMon, shortAddr } from "@/lib/format";

function parseId(s: string): bigint | null {
  return /^\d{1,30}$/.test(s) && s !== "0" ? BigInt(s) : null;
}

export function AuctionView({ rawId }: { rawId: string }) {
  const id = parseId(rawId);
  const { data: lot, isPending, error } = useAuction(id);
  const history = useBidHistory(id, lot?.createdAtBlock);
  const now = useChainTime();
  const qc = useQueryClient();

  if (id === null) return <Card>Invalid auction ID.</Card>;
  if (!auctionHouse) return <Card>Contracts are not deployed on {targetChain.name} yet.</Card>;
  if (isPending) return <div className="h-[600px] animate-pulse rounded-3xl bg-secondary" />;
  if (error) return <Card className="text-warning">Could not reach the RPC. Retrying…</Card>;
  if (!lot) return <Card>Auction #{id.toString()} does not exist on {targetChain.name}.</Card>;

  const state = lotState(lot.status, lot.endTime, now);
  const bids = history.data?.bids ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["auction"] });
    qc.invalidateQueries({ queryKey: ["bids"] });
  };
  const contractUrl = explorerAddress(lot.nft);
  const open = state === "live" || state === "ending";

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold">
        <ChevronLeft className="size-4" /> All auctions
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,720px)_minmax(0,460px)] lg:justify-between">
        <div className="space-y-6">
          <NftArt tokenId={lot.tokenId} image={lot.meta?.image} alt={lotTitle(lot)} className="rounded-3xl" />
          <div className="hidden lg:block">
            <BidHistory bids={bids} loading={history.isPending} syncing={Boolean(history.data?.syncing)} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <Eyebrow>{lot.meta?.category ?? "Digital"} · NFT · ERC-721</Eyebrow>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[36px]">{lotTitle(lot)}</h1>
            <p className="text-sm text-muted-foreground">
              Auction #{lot.id.toString()} · Seller <span className="font-mono">{shortAddr(lot.seller)}</span>
            </p>
          </div>

          <div id="bid-panel">
            <BidPanel lot={lot} state={state} now={now} bidCount={bids.length} onChanged={refresh} />
          </div>

          <WatchButton id={lot.id} full />

          <Card className="flex items-center gap-4">
            <AuctionQr id={lot.id} caption={false} className="w-28 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Scan to bid from a phone</p>
              <p className="text-muted-foreground">Opens this auction. No wallet? A quick-bid wallet with test MON is one tap away.</p>
              <QrFullscreenButton id={lot.id} title={lotTitle(lot)} className="mt-1 h-9 px-3 text-xs" />
            </div>
          </Card>

          <Link
            href={`/screen/${lot.id}`}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-card text-sm font-semibold"
          >
            <MonitorPlay className="size-4" /> Open audience screen
          </Link>

          {lot.meta?.description && (
            <Card>
              <h2 className="text-lg font-semibold">About this item</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{lot.meta.description}</p>
              {lot.meta.condition && <p className="mt-2 text-sm">Condition: {lot.meta.condition} <span className="text-xs text-muted-foreground">(seller-provided)</span></p>}
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-semibold">Token & ownership</h2>
            <dl className="mt-2 divide-y divide-border text-sm">
              {[
                ["Network", targetChain.name],
                ["Standard", "ERC-721"],
                ["Token ID", lot.tokenId.toString()],
                ["Contract", contractUrl ? <a key="c" className="font-mono underline" href={contractUrl} target="_blank" rel="noreferrer">{shortAddr(lot.nft)}</a> : <span key="c" className="font-mono">{shortAddr(lot.nft)}</span>],
                ["Holder", lot.status === "Active" ? "AuctionHouse (escrow)" : lot.status === "Cancelled" ? "Seller" : lot.highestBid > 0n ? "Winner" : "Seller"],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Read live from the chain. Metadata (name, photo, description) is seller-provided.</p>
          </Card>

          <div className="lg:hidden">
            <BidHistory bids={bids} loading={history.isPending} syncing={Boolean(history.data?.syncing)} />
          </div>

          <Card>
            <h2 className="text-lg font-semibold">Rights & limitations</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The NFT is a listing record minted by the seller. For physical items, delivery happens off-chain and is
              not enforced by the contract. Test MON only; contracts are unaudited.
            </p>
          </Card>
        </div>
      </div>

      {open && (
        <a
          href="#bid-panel"
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between border-t border-border bg-card px-4 py-3 md:hidden"
        >
          <span>
            <span className="block text-xs text-muted-foreground">Current bid · {formatCountdown(now ? Number(lot.endTime) - now : 0)}</span>
            <span className="font-mono font-semibold">{formatMon(lot.highestBid > 0n ? lot.highestBid : lot.minPrice)} MON</span>
          </span>
          <span className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold">Place bid</span>
        </a>
      )}
    </div>
  );
}
