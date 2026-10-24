"use client";

import { MonitorPlay, Plus } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { lotTitle } from "@/components/auction-card";
import { Btn, Card, Eyebrow, Notice, StatePill, TxLink, lotState } from "@/components/kit";
import { NftArt } from "@/components/nft-art";
import { AuctionQr } from "@/components/qr";
import { WalletGate, useMounted } from "@/components/wallet";
import { useAuctions, type Lot } from "@/hooks/use-auctions";
import { useChainTime } from "@/hooks/use-chain-time";
import { useTx } from "@/hooks/use-tx";
import { auctionHouse, minNextBid } from "@/lib/contracts";
import { formatCountdown, formatMon, shortAddr } from "@/lib/format";

/** Host/seller console: your auctions with QR, audience screen, settle and cancel. */
export default function HostPage() {
  const mounted = useMounted();
  const { address } = useAccount();
  const { data } = useAuctions();
  const now = useChainTime();
  const me = address?.toLowerCase();
  const mine = (data?.lots ?? []).filter((l) => l.seller.toLowerCase() === me);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Host console</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight">Run the room</h1>
          <p className="text-sm text-muted-foreground">Start a lot, put the QR on the big screen, close it yourself when the clock hits zero.</p>
        </div>
        <Link href="/create"><Btn><Plus className="size-4" /> New auction</Btn></Link>
      </div>

      {!mounted ? null : !address ? (
        <Card className="max-w-md"><WalletGate action="host"><span /></WalletGate></Card>
      ) : mine.length === 0 ? (
        <Card className="space-y-3">
          <p className="font-semibold">No auctions from {shortAddr(address)} yet</p>
          <p className="text-sm text-muted-foreground">Create one: mint an item NFT, approve, start the auction — three transactions.</p>
          <Link href="/create"><Btn>Sell an item</Btn></Link>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {mine.map((l) => <HostLot key={l.id.toString()} lot={l} now={now} />)}
        </div>
      )}

    </div>
  );
}

function HostLot({ lot, now }: { lot: Lot; now: number | null }) {
  const qc = useQueryClient();
  const settle = useTx();
  const cancel = useTx();
  const state = lotState(lot.status, lot.endTime, now);
  const left = now === null ? 0 : Number(lot.endTime) - now;
  const refresh = () => qc.invalidateQueries();

  return (
    <Card className="space-y-4">
      <div className="flex gap-4">
        <NftArt tokenId={lot.tokenId} image={lot.meta?.image} alt={lotTitle(lot)} className="size-24 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <StatePill state={state} />
          <p className="truncate font-semibold">#{lot.id.toString()} · {lotTitle(lot)}</p>
          <p className="font-mono text-sm">
            {lot.highestBid > 0n ? `${formatMon(lot.highestBid)} MON top` : `${formatMon(lot.minPrice)} MON start`} · next ≥ {formatMon(minNextBid(lot))}
          </p>
          <p className="font-mono text-sm text-muted-foreground">
            {state === "live" || state === "ending" ? `Ends in ${formatCountdown(left)}` : state === "awaiting" ? "Expired — settle now" : lot.status}
          </p>
        </div>
        {(state === "live" || state === "ending") && <AuctionQr id={lot.id} caption={false} className="w-24 shrink-0" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/auction/${lot.id}`}><Btn size="md" variant="secondary">Open</Btn></Link>
        <Link href={`/screen/${lot.id}`} target="_blank"><Btn size="md" variant="secondary"><MonitorPlay className="size-4" /> Audience screen</Btn></Link>
        {state === "awaiting" && (
          <Btn size="md" variant="dark" loading={settle.busy} disabled={settle.busy} onClick={async () => {
            await settle.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "endAuction", args: [lot.id] });
            refresh();
          }}>
            {settle.phase === "confirming" ? "Settling…" : "Settle"}
          </Btn>
        )}
        {lot.status === "Active" && lot.highestBid === 0n && (
          <Btn size="md" variant="secondary" loading={cancel.busy} disabled={cancel.busy} onClick={async () => {
            await cancel.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "cancelAuction", args: [lot.id] });
            refresh();
          }}>
            Cancel
          </Btn>
        )}
      </div>
      {settle.phase === "success" && settle.hash && <Notice tone="success">Settled in a confirmed transaction. <TxLink hash={settle.hash} /></Notice>}
      {(settle.error || cancel.error) && <Notice tone="danger">{settle.error ?? cancel.error}</Notice>}
    </Card>
  );
}
