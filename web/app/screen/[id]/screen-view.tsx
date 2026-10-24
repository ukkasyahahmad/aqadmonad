"use client";

import { Radio, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lotTitle } from "@/components/auction-card";
import { lotState, StatePill, TxLink } from "@/components/kit";
import { LogoMark } from "@/components/logo";
import { NftArt } from "@/components/nft-art";
import { AuctionQr } from "@/components/qr";
import { useAuction } from "@/hooks/use-auctions";
import { useBidHistory } from "@/hooks/use-bid-history";
import { useChainTime } from "@/hooks/use-chain-time";
import { useLiveBids } from "@/hooks/use-live-bids";
import { nickname } from "@/lib/burner";
import { targetChain } from "@/lib/chain";
import { auctionHouse, minNextBid } from "@/lib/contracts";
import { formatCountdown, formatMon } from "@/lib/format";

/** Projector view (16:9, readable from ~10 m). All numbers come from the chain. */
export function ScreenView({ raw }: { raw: string }) {
  const id = /^\d{1,30}$/.test(raw ?? "") && raw !== "0" ? BigInt(raw) : null;
  const { data: lot } = useAuction(id);
  const history = useBidHistory(id, lot?.createdAtBlock);
  const live = useLiveBids(id);
  const now = useChainTime();

  // Merge WebSocket (fastest) and polled history (complete), de-duplicated, newest first.
  const feed = useMemo(() => {
    const map = new Map<string, { bidder: string; amount: bigint; blockNumber: bigint; txHash: string; seenAt?: number }>();
    for (const b of history.data?.bids ?? []) map.set(`${b.txHash}-${b.logIndex}`, b);
    for (const b of live.bids) map.set(`${b.txHash}-${b.logIndex}`, { ...map.get(`${b.txHash}-${b.logIndex}`), ...b });
    return [...map.values()].sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? 1 : -1));
  }, [history.data, live.bids]);

  // Anti-sniping flash: endTime moved later while live.
  const lastEnd = useRef<bigint | null>(null);
  const [extended, setExtended] = useState<number | null>(null);
  useEffect(() => {
    if (!lot) return;
    if (lastEnd.current !== null && lot.endTime > lastEnd.current) {
      setExtended(Number(lot.endTime - lastEnd.current));
      const t = setTimeout(() => setExtended(null), 4000);
      lastEnd.current = lot.endTime;
      return () => clearTimeout(t);
    }
    lastEnd.current = lot.endTime;
  }, [lot]);

  if (id === null) return <Center>Invalid auction ID.</Center>;
  if (!auctionHouse) return <Center>Contracts are not deployed on {targetChain.name} yet.</Center>;
  if (!lot) return <Center>Loading auction #{raw}…</Center>;

  const state = lotState(lot.status, lot.endTime, now);
  const left = now === null ? 0 : Number(lot.endTime) - now;
  const leader = lot.highestBid > 0n ? lot.highestBidder : null;
  const refunds = Math.max(0, feed.length - 1);

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#101311] text-[#EEF0ED]">
      <div className="grid aspect-video max-h-screen w-full max-w-[177.78vh] grid-cols-[1.1fr_1fr] gap-[2vh] p-[3vh]">
        {/* left: lot + QR */}
        <div className="flex min-h-0 flex-col gap-[2vh]">
          <div className="flex items-center gap-[1.2vh]">
            <LogoMark className="size-[5vh] ring-1 ring-[#2A302C] rounded-[1.2vh]" />
            <span className="text-[2.6vh] font-semibold">Live Auction</span>
            <span className="ml-auto text-[1.8vh] text-[#C9D0CB]">Auction #{lot.id.toString()} · {targetChain.name}</span>
          </div>
          <div className="relative min-h-0 flex-1">
            <NftArt tokenId={lot.tokenId} image={lot.meta?.image} alt={lotTitle(lot)} className="h-full w-auto max-w-full rounded-[2.4vh]" />
          </div>
          <div className="flex items-end gap-[2vh]">
            <div className="min-w-0 flex-1">
              <p className="text-[1.6vh] font-semibold uppercase tracking-widest text-[#C9D0CB]">{lot.meta?.category ?? "NFT"} · Token #{lot.tokenId.toString()}</p>
              <p className="line-clamp-2 text-[4vh] font-semibold leading-tight">{lotTitle(lot)}</p>
            </div>
            {state !== "settled" && state !== "cancelled" && (
              <div className="w-[20vh] shrink-0 text-center">
                <AuctionQr id={lot.id} caption={false} />
                <p className="mt-[0.6vh] text-[1.6vh] font-semibold text-[#E4ED72]">Scan to bid</p>
              </div>
            )}
          </div>
        </div>

        {/* right: clock, price, feed */}
        <div className="flex min-h-0 flex-col gap-[2vh]">
          <div className="flex items-center justify-between">
            <StatePill state={state} />
            <span className="flex items-center gap-[0.8vh] text-[1.6vh] text-[#C9D0CB]">
              <Radio className={`size-[1.8vh] ${live.status === "live" ? "text-[#7FD3A4]" : ""}`} />
              {live.status === "live" ? "Live via WebSocket (monadLogs)" : "Polling every 2 s"}
            </span>
          </div>

          {state === "settled" ? (
            <div className="rounded-[2.4vh] bg-[#E4ED72] p-[3vh] text-[#171A18]">
              <p className="text-[2.2vh] font-semibold">{leader ? "Sold" : "Ended — no bids"}</p>
              <p className="font-mono text-[9vh] font-semibold leading-none">{formatMon(lot.highestBid)} MON</p>
              {leader && <p className="mt-[1vh] text-[2.4vh]">Winner {nickname(leader)} · <span className="font-mono">{leader.slice(0, 6)}…{leader.slice(-4)}</span></p>}
              <p className="mt-[1vh] text-[1.8vh]">{feed.length} bids · {refunds} outbid refund{refunds === 1 ? "" : "s"} credited</p>
            </div>
          ) : (
            <>
              <div className={`rounded-[2.4vh] p-[2.4vh] transition-colors ${extended ? "bg-[#E4ED72] text-[#171A18]" : state === "ending" ? "bg-[#3A2E10]" : "bg-[#1C211E]"}`}>
                <p className="flex items-center gap-[1vh] text-[2vh] font-semibold">
                  <Timer className="size-[2.4vh]" />
                  {extended ? `Anti-sniping: +${extended}s — late bid extended the clock` : state === "awaiting" ? "Time is up — awaiting settlement" : "Ends in"}
                </p>
                <p className="font-mono text-[20vh] font-semibold leading-none tabular-nums">{state === "awaiting" ? "00:00" : formatCountdown(left)}</p>
              </div>
              <div className="grid grid-cols-2 gap-[2vh]">
                <div className="rounded-[2.4vh] bg-[#1C211E] p-[2vh]">
                  <p className="text-[1.8vh] text-[#C9D0CB]">{leader ? "Top bid" : "Starting price"}</p>
                  <p className="font-mono text-[5.5vh] font-semibold leading-tight">{formatMon(leader ? lot.highestBid : lot.minPrice)}</p>
                  <p className="text-[2vh] text-[#E4ED72]">{leader ? nickname(leader) : "No bids yet"}</p>
                </div>
                <div className="rounded-[2.4vh] bg-[#1C211E] p-[2vh]">
                  <p className="text-[1.8vh] text-[#C9D0CB]">Next bid ≥</p>
                  <p className="font-mono text-[5.5vh] font-semibold leading-tight">{formatMon(minNextBid(lot))}</p>
                  <p className="text-[2vh] text-[#C9D0CB]">MON · +5%</p>
                </div>
              </div>
            </>
          )}

          <div className="min-h-0 flex-1 overflow-hidden rounded-[2.4vh] bg-[#1C211E] p-[2vh]">
            <p className="mb-[1vh] text-[1.8vh] font-semibold text-[#C9D0CB]">Live bids</p>
            {feed.length === 0 ? (
              <p className="text-[2.2vh] text-[#C9D0CB]">No bids yet — be the first.</p>
            ) : (
              <ul className="space-y-[0.8vh]">
                {feed.slice(0, 6).map((b, i) => (
                  <li key={b.txHash} className={`flex items-center gap-[1.5vh] text-[2.2vh] ${i === 0 ? "text-[#E4ED72]" : "text-[#C9D0CB]"}`}>
                    <span className="w-[16vh] truncate font-semibold">{nickname(b.bidder)}</span>
                    <span className="font-mono font-semibold">{formatMon(b.amount)} MON</span>
                    <span className="ml-auto font-mono text-[1.5vh]">block {b.blockNumber.toString()}</span>
                    <span className="text-[1.5vh] [&_a]:text-inherit"><TxLink hash={b.txHash} label="tx" /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid h-screen place-items-center bg-[#101311] text-2xl text-[#EEF0ED]">{children}</div>;
}
