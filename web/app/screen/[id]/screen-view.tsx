"use client";

import { Gauge, Radio, Timer, Trophy, Users, Volume2, VolumeX, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { lotTitle } from "@/components/auction-card";
import { lotState, StatePill, TxLink } from "@/components/kit";
import { Confetti } from "@/components/confetti";
import { LogoMark } from "@/components/logo";
import { NftArt } from "@/components/nft-art";
import { AuctionQr, QrFullscreenButton } from "@/components/qr";
import { useAnimatedWei } from "@/hooks/use-animated-wei";
import { useAuction } from "@/hooks/use-auctions";
import { useBidHistory } from "@/hooks/use-bid-history";
import { useBlockRate } from "@/hooks/use-block-rate";
import { useBurner } from "@/hooks/use-burner";
import { useChainTime } from "@/hooks/use-chain-time";
import { useLiveBids } from "@/hooks/use-live-bids";
import { useSpeedProbe } from "@/hooks/use-speed-probe";
import { nickname } from "@/lib/burner";
import { targetChain } from "@/lib/chain";
import { auctionHouse, minNextBid } from "@/lib/contracts";
import { formatCountdown, formatMon } from "@/lib/format";
import { enableSound, playBidTick, playGavel } from "@/lib/sound";

type FeedBid = { bidder: string; amount: bigint; blockNumber: bigint; txHash: string; logIndex: number };

/** Projector view (16:9, readable from ~10 m). Every number comes from the chain or is measured here. */
export function ScreenView({ raw }: { raw: string }) {
  const id = /^\d{1,30}$/.test(raw ?? "") && raw !== "0" ? BigInt(raw) : null;
  const { data: lot } = useAuction(id);
  const history = useBidHistory(id, lot?.createdAtBlock);
  const live = useLiveBids(id);
  const now = useChainTime();
  const [soundOn, setSoundOn] = useState(false);

  // Merge WebSocket (fastest) and polled history (complete), de-duplicated, newest first.
  const feed = useMemo<FeedBid[]>(() => {
    const map = new Map<string, FeedBid>();
    for (const b of history.data?.bids ?? []) map.set(`${b.txHash}-${b.logIndex}`, b);
    for (const b of live.bids) map.set(`${b.txHash}-${b.logIndex}`, b);
    return [...map.values()].sort((a, b) =>
      a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber < b.blockNumber ? 1 : -1,
    );
  }, [history.data, live.bids]);

  // Leaderboard: each wallet's best bid and bid count.
  const board = useMemo(() => {
    const by = new Map<string, { bidder: string; best: bigint; bids: number }>();
    for (const b of feed) {
      const k = b.bidder.toLowerCase();
      const cur = by.get(k) ?? { bidder: b.bidder, best: 0n, bids: 0 };
      cur.bids++;
      if (b.amount > cur.best) cur.best = b.amount;
      by.set(k, cur);
    }
    return [...by.values()].sort((a, b) => (a.best === b.best ? 0 : a.best < b.best ? 1 : -1));
  }, [feed]);

  // New-bid flash (derived during render; the first load does not flash).
  const topKey = feed[0] ? `${feed[0].txHash}-${feed[0].logIndex}` : null;
  const [seenTop, setSeenTop] = useState<string | null | undefined>(undefined);
  const [flash, setFlash] = useState<{ n: number; bidder: string } | null>(null);
  if (history.data && topKey !== seenTop) {
    setSeenTop(topKey);
    if (seenTop !== undefined && topKey && feed[0]) setFlash({ n: (flash?.n ?? 0) + 1, bidder: feed[0].bidder });
  }

  // Anti-sniping flash: end time moved later while we watched.
  const [lastEnd, setLastEnd] = useState<bigint | null>(null);
  const [extended, setExtended] = useState<{ n: number; secs: number } | null>(null);
  if (lot && lot.endTime !== lastEnd) {
    setLastEnd(lot.endTime);
    if (lastEnd !== null && lot.endTime > lastEnd) setExtended({ n: (extended?.n ?? 0) + 1, secs: Number(lot.endTime - lastEnd) });
  }

  const state = lot ? lotState(lot.status, lot.endTime, now) : "live";
  const sold = state === "settled" && !!lot && lot.highestBid > 0n;

  // Side effects only: sounds and auto-clearing banners.
  useEffect(() => {
    if (!flash) return;
    if (soundOn) playBidTick();
    const t = setTimeout(() => setFlash((f) => (f?.n === flash.n ? { ...f, bidder: "" } : f)), 2500);
    return () => clearTimeout(t);
  }, [flash, soundOn]);
  useEffect(() => {
    if (!extended) return;
    const t = setTimeout(() => setExtended((e) => (e?.n === extended.n ? { ...e, secs: 0 } : e)), 4000);
    return () => clearTimeout(t);
  }, [extended]);
  const [soldSeen, setSoldSeen] = useState(false);
  if (sold && !soldSeen) setSoldSeen(true);
  useEffect(() => {
    if (soldSeen && soundOn) playGavel();
  }, [soldSeen, soundOn]);

  const tickLeft = lot && (state === "live" || state === "ending") && now !== null ? Number(lot.endTime) - now : null;
  useEffect(() => {
    if (soundOn && tickLeft !== null && tickLeft > 0 && tickLeft <= 10) playBidTick();
  }, [tickLeft, soundOn]);

  const shownPrice = useAnimatedWei(lot ? (lot.highestBid > 0n ? lot.highestBid : lot.minPrice) : 0n);

  if (id === null) return <Center>Invalid auction ID.</Center>;
  if (!auctionHouse) return <Center>Contracts are not deployed on {targetChain.name} yet.</Center>;
  if (!lot) return <Center>Loading auction #{raw}…</Center>;

  const left = now === null ? 0 : Number(lot.endTime) - now;
  const finalCount = (state === "live" || state === "ending") && left > 0 && left <= 10;
  const syncing = !history.data || history.data.syncing;
  const leader = lot.highestBid > 0n ? lot.highestBidder : null;
  const refunds = Math.max(0, feed.length - 1);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#101311] text-[#EEF0ED]">
      {sold && <Confetti />}
      {/* 16:9 stage that always fits the window; everything inside is sized in cqh (stage height) */}
      <div className="h-[min(100vh,56.25vw)] w-[min(100vw,177.78vh)] overflow-hidden [container-type:size]">
      <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-[2cqh] p-[3cqh]">
        {/* left: lot, QR, Monad speed */}
        <div className="flex min-h-0 flex-col gap-[1.6cqh]">
          <div className="flex items-center gap-[1.2cqh]">
            <LogoMark className="size-[5cqh] rounded-[1.2cqh] ring-1 ring-[#2A302C]" />
            <span className="text-[2.6cqh] font-semibold">Aqad</span>
            <span className="ml-auto text-[1.6cqh] text-[#C9D0CB]">Auction #{lot.id.toString()} · {targetChain.name}</span>
          </div>
          <div className="flex min-h-0 flex-1 gap-[2cqh]">
            <div className="relative min-h-0 flex-1">
              <NftArt tokenId={lot.tokenId} image={lot.meta?.image} alt={lotTitle(lot)} className="h-full w-auto max-w-full rounded-[2.4cqh]" />
            </div>
            {/* QR opens this lot while it runs; once it is over it points to /live (the next lot) */}
            {(
              <div className="flex w-[22cqh] shrink-0 flex-col justify-end text-center">
                <AuctionQr id={lot.id} caption={false} path={state === "settled" || state === "cancelled" ? "/live" : undefined} />
                <p className="mt-[0.8cqh] text-[2.2cqh] font-semibold text-[#E4ED72]">{state === "settled" || state === "cancelled" ? "Scan for the next lot" : "Scan to bid"}</p>
                <p className="text-[1.4cqh] text-[#C9D0CB]">Free test MON · no app needed</p>
                <QrFullscreenButton
                  id={lot.id}
                  path={state === "settled" || state === "cancelled" ? "/live" : undefined}
                  title={state === "settled" || state === "cancelled" ? "Join the next lot" : lotTitle(lot)}
                  label="Fullscreen QR"
                  className="mt-[1cqh] h-[4cqh] w-full gap-[0.6cqh] border-0 bg-[#1C211E] px-[1cqh] text-[1.5cqh] text-[#C9D0CB] hover:bg-[#2A302C] [&_svg]:size-[1.6cqh]"
                />
              </div>
            )}
          </div>
          <div>
            <p className="text-[1.5cqh] font-semibold uppercase tracking-widest text-[#C9D0CB]">{lot.meta?.category ?? "NFT"} · Token #{lot.tokenId.toString()}</p>
            <p className="line-clamp-1 text-[3.6cqh] font-semibold leading-tight">{lotTitle(lot)}</p>
          </div>
          <SpeedPanel />
        </div>

        {/* right: clock, price, leaderboard */}
        <div className="flex min-h-0 flex-col gap-[1.6cqh]">
          <div className="flex items-center gap-[1.6cqh]">
            <StatePill state={state} />
            <span className="flex items-center gap-[0.8cqh] text-[2cqh] font-semibold">
              <Users className="size-[2.2cqh]" />
              {syncing ? "Reading bids…" : `${board.length} wallet${board.length === 1 ? "" : "s"} · ${feed.length} bid${feed.length === 1 ? "" : "s"}`}
            </span>
            <span className="ml-auto flex items-center gap-[0.6cqh] text-[1.4cqh] text-[#C9D0CB]">
              <Radio className={`size-[1.6cqh] ${live.status === "live" ? "text-[#7FD3A4]" : ""}`} />
              {live.status === "live" ? "monadLogs" : "polling"}
            </span>
            <button
              onClick={() => setSoundOn((s) => (s ? false : enableSound()))}
              className="grid size-[4cqh] place-items-center rounded-full bg-[#1C211E] text-[#C9D0CB]"
              aria-label={soundOn ? "Sound off" : "Sound on"}
            >
              {soundOn ? <Volume2 className="size-[2cqh]" /> : <VolumeX className="size-[2cqh]" />}
            </button>
          </div>

          {state === "settled" ? (
            <div className="pop-in rounded-[2.4cqh] bg-[#E4ED72] p-[3cqh] text-[#171A18]">
              <p className="text-[2.6cqh] font-semibold">{leader ? "SOLD" : "Ended — no bids"}</p>
              <p className="font-mono text-[9cqh] font-semibold leading-none">{formatMon(lot.highestBid)} MON</p>
              {leader && (
                <p className="mt-[1cqh] text-[2.6cqh]">
                  Winner <b>{nickname(leader)}</b> · <span className="font-mono">{leader.slice(0, 6)}…{leader.slice(-4)}</span>
                </p>
              )}
              <p className="mt-[1cqh] text-[2cqh]">
                {syncing
                  ? "Reading bid history from the chain…"
                  : `${feed.length} bids from ${board.length} wallets · ${refunds} outbid refund${refunds === 1 ? "" : "s"} credited in full`}
              </p>
            </div>
          ) : (
            <>
              <div
                className={`rounded-[2.4cqh] p-[2.2cqh] transition-colors ${extended?.secs ? "bg-[#E4ED72] text-[#171A18]" : state === "ending" ? "bg-[#3A2E10]" : "bg-[#1C211E]"}`}
              >
                <p className="flex items-center gap-[1cqh] text-[2cqh] font-semibold">
                  <Timer className="size-[2.4cqh]" />
                  {extended?.secs
                    ? `Anti-sniping: +${extended.secs}s — a late bid extended the clock`
                    : state === "awaiting"
                      ? "Time is up — awaiting settlement transaction"
                      : "Ends in"}
                </p>
                <p
                  key={finalCount ? left : "clock"}
                  className={`whitespace-nowrap font-mono font-semibold leading-none tabular-nums ${left >= 3600 && state !== "awaiting" ? "text-[13cqh]" : "text-[20cqh]"} ${finalCount ? "pop-in text-[#E4ED72]" : ""}`}
                >
                  {state === "awaiting" ? "00:00" : formatCountdown(left)}
                </p>
              </div>
              <div key={flash?.n ?? 0} className={`grid grid-cols-[1.4fr_1fr] gap-[2cqh] rounded-[2.4cqh] bg-[#1C211E] p-[2cqh] ${flash?.n ? "bid-flash" : ""}`}>
                <div>
                  <p className="text-[1.8cqh] text-[#C9D0CB]">{leader ? "Top bid" : "Starting price"}</p>
                  <p className="font-mono text-[6cqh] font-semibold leading-tight tabular-nums">{formatMon(shownPrice, 4)}</p>
                  <p className="text-[2.2cqh] font-semibold text-[#E4ED72]">
                    {flash?.bidder ? `NEW BID · ${nickname(flash.bidder)}` : leader ? nickname(leader) : "No bids yet — be first"}
                  </p>
                </div>
                <div>
                  <p className="text-[1.8cqh] text-[#C9D0CB]">Next bid ≥</p>
                  <p className="font-mono text-[6cqh] font-semibold leading-tight">{formatMon(minNextBid(lot), 4)}</p>
                  <p className="text-[2cqh] text-[#C9D0CB]">MON · +5%</p>
                </div>
              </div>
            </>
          )}

          <div className="min-h-0 flex-1 overflow-hidden rounded-[2.4cqh] bg-[#1C211E] p-[2cqh]">
            <p className="mb-[1cqh] flex items-center gap-[0.8cqh] text-[1.8cqh] font-semibold text-[#C9D0CB]">
              <Trophy className="size-[2cqh]" /> Leaderboard · best bid per wallet
            </p>
            {board.length === 0 ? (
              <p className="text-[2.2cqh] text-[#C9D0CB]">{syncing ? "Reading bids from the chain…" : "Scan the QR and be the first bidder."}</p>
            ) : (
              <ol className="space-y-[0.6cqh]">
                {board.slice(0, 5).map((r, i) => (
                  <li
                    key={r.bidder}
                    className={`pop-in flex items-center gap-[1.5cqh] rounded-[1.2cqh] px-[1.2cqh] py-[0.6cqh] text-[2.3cqh] ${i === 0 ? "bg-[#E4ED72] text-[#171A18]" : "text-[#EEF0ED]"}`}
                  >
                    <span className="w-[3cqh] font-mono font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{nickname(r.bidder)}</span>
                    <span className="font-mono font-semibold">{formatMon(r.best, 4)} MON</span>
                    <span className={`w-[9cqh] text-right text-[1.6cqh] ${i === 0 ? "" : "text-[#C9D0CB]"}`}>{r.bids} bid{r.bids === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ol>
            )}
            {feed[0] && (
              <p className="mt-[1cqh] truncate text-[1.5cqh] text-[#C9D0CB] [&_a]:text-inherit">
                Latest: block {feed[0].blockNumber.toString()} · <TxLink hash={feed[0].txHash} label="view tx" />
              </p>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/** Monad speed, measured on this screen: block cadence + live sync-receipt probe. */
function SpeedPanel() {
  const { block, avgMs } = useBlockRate();
  const burner = useBurner();
  const [probeOn, setProbeOn] = useState(false);
  const ready = probeOn && !!burner.account && burner.balance > 0n;
  const probe = useSpeedProbe(burner.account, ready);
  const funding = burner.phase === "requesting" || burner.phase === "settling";

  async function toggle() {
    if (probeOn) return setProbeOn(false);
    if (!burner.account) burner.create();
    setProbeOn(true);
  }
  useEffect(() => {
    if (probeOn && burner.account && burner.balance === 0n && burner.phase === "idle") void burner.fund();
  }, [probeOn, burner]);

  return (
    <div className="rounded-[2.4cqh] bg-[#1C211E] p-[1.8cqh]">
      <div className="mb-[1cqh] flex items-center gap-[0.8cqh] text-[1.7cqh] font-semibold text-[#C9D0CB]">
        <Zap className="size-[2cqh] text-[#E4ED72]" /> Monad speed · measured live on this screen
        <button onClick={toggle} className="ml-auto rounded-full bg-[#2A302C] px-[1.2cqh] py-[0.4cqh] text-[1.4cqh] text-[#EEF0ED]">
          {probeOn ? "Speed probe on" : "Start speed probe"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-[1.5cqh]">
        <Metric label="Live block" value={block !== undefined ? `#${block.toString()}` : "…"} />
        <Metric label="Avg block time" value={avgMs ? `${(avgMs / 1000).toFixed(2)} s` : "…"} sub="Ethereum: ~12 s" />
        <Metric
          label="Tx confirmed (sync)"
          value={probe.avg !== null ? `${(probe.avg / 1000).toFixed(2)} s` : probeOn ? (funding ? "funding…" : "probing…") : "off"}
          sub={probe.last ? `last ${probe.last.ms} ms · ${probe.samples.length} real txs` : probe.error ?? burner.error ?? "send → receipt, real tx"}
        />
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-[0.5cqh] truncate text-[1.4cqh] text-[#C9D0CB]"><Gauge className="size-[1.5cqh] shrink-0" />{label}</p>
      <p className="truncate font-mono text-[3.4cqh] font-semibold leading-tight">{value}</p>
      {sub && <p className="truncate text-[1.4cqh] text-[#C9D0CB]">{sub}</p>}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid h-screen place-items-center bg-[#101311] text-2xl text-[#EEF0ED]">{children}</div>;
}
