"use client";

import { ArrowRight, Bookmark } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { useBurner } from "@/hooks/use-burner";
import { nickname } from "@/lib/burner";
import { lotTitle } from "@/components/auction-card";
import { Btn, Card, Eyebrow, lotState, StatePill } from "@/components/kit";
import { NftArt } from "@/components/nft-art";
import { WalletGate, useMounted } from "@/components/wallet";
import { WatchButton } from "@/components/watch-button";
import { fetchLot, GALLERY_LIMIT, useAuctions, type Lot } from "@/hooks/use-auctions";
import { useChainTime } from "@/hooks/use-chain-time";
import { useWatchlist } from "@/hooks/use-watchlist";
import { formatCountdown, formatMon } from "@/lib/format";

function Row({ lot, now, note }: { lot: Lot; now: number | null; note?: string }) {
  const state = lotState(lot.status, lot.endTime, now);
  const left = now === null ? 0 : Number(lot.endTime) - now;
  return (
    <Link href={`/auction/${lot.id}`} className="flex items-center gap-3 rounded-2xl border border-border p-2 pr-3 hover:bg-secondary">
      <NftArt tokenId={lot.tokenId} image={lot.meta?.image} alt={lotTitle(lot)} className="size-[72px] shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-1">
        <StatePill state={state} />
        <p className="truncate font-semibold">{lotTitle(lot)}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {formatMon(lot.highestBid > 0n ? lot.highestBid : lot.minPrice)} MON
          {(state === "live" || state === "ending") && ` · ${formatCountdown(left)}`}
          {note && ` · ${note}`}
        </p>
      </div>
      <WatchButton id={lot.id} />
    </Link>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent"><Bookmark className="size-5" /></span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      <Link href="/"><Btn size="md" variant="secondary">Browse auctions <ArrowRight className="size-4" /></Btn></Link>
    </div>
  );
}

export default function AccountPage() {
  const mounted = useMounted();
  const { address: walletAddress } = useAccount();
  const burner = useBurner();
  // Phones bid with the quick-bid wallet; desktops usually with MetaMask. Show whichever is active.
  const address = walletAddress ?? burner.account?.address;
  const viaQuick = !walletAddress && !!burner.account;
  const { data } = useAuctions();
  const now = useChainTime();
  const { ids } = useWatchlist();
  const client = usePublicClient();
  const watch = useQuery({
    queryKey: ["watchlist", ids.join(",")],
    enabled: Boolean(client) && ids.length > 0,
    refetchInterval: 4000,
    queryFn: async () => (await Promise.all(ids.slice(0, 24).map((id) => fetchLot(client, BigInt(id))))).filter((l): l is Lot => !!l),
  });

  const me = address?.toLowerCase();
  const lots = data?.lots ?? [];
  const listings = me ? lots.filter((l) => l.seller.toLowerCase() === me) : [];
  const leading = me ? lots.filter((l) => l.highestBidder.toLowerCase() === me) : [];

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Account</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">Your bids, listings & watchlist</h1>
        <p className="text-sm text-muted-foreground">Bids and listings are read from the latest {GALLERY_LIMIT} auctions on-chain. Outbid refunds appear in the banner above.</p>
        {mounted && viaQuick && burner.account && (
          <p className="mt-2 inline-flex rounded-full bg-accent px-3 py-1 text-sm">
            Showing your quick-bid wallet <b className="ml-1">{nickname(burner.account.address)}</b>
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card id="bids" className="space-y-3">
          <h2 className="text-lg font-semibold">My bids · leading</h2>
          {!mounted ? null : !address ? (
            <WalletGate action="see your bids"><span /></WalletGate>
          ) : leading.length === 0 ? (
            <Empty title="No leading bids" body="Auctions where this wallet holds the highest bid show here." />
          ) : (
            leading.map((l) => <Row key={l.id.toString()} lot={l} now={now} note={l.status === "Ended" ? "won" : "leading"} />)
          )}
        </Card>
        <Card id="listings" className="space-y-3">
          <h2 className="text-lg font-semibold">My listings</h2>
          {!mounted ? null : !address ? (
            <WalletGate action="see your listings"><span /></WalletGate>
          ) : listings.length === 0 ? (
            <Empty title="No listings yet" body="Mint an item and start an auction from Sell an item." />
          ) : (
            listings.map((l) => <Row key={l.id.toString()} lot={l} now={now} />)
          )}
        </Card>
        <Card id="watchlist" className="space-y-3">
          <h2 className="text-lg font-semibold">Watchlist · {mounted ? ids.length : 0}</h2>
          {!mounted || ids.length === 0 ? (
            <Empty title="Nothing saved yet" body="Use the bookmark on any card or auction to follow it here." />
          ) : (
            (watch.data ?? []).map((l) => <Row key={l.id.toString()} lot={l} now={now} />)
          )}
          <p className="text-xs text-muted-foreground">Watchlist is stored in this browser only.</p>
        </Card>
      </div>
    </div>
  );
}
