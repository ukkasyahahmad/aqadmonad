"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther, zeroAddress, type Address, type Hex } from "viem";
import { ArrowUpRight, CircleCheck, Undo2, Zap } from "lucide-react";
import { getBurner } from "@/lib/burner";
import { bidError } from "@/lib/bids";
import { publicClient } from "@/lib/chain";
import { AUCTION_ADDRESS, GAS, auctionAbi, txUrl } from "@/lib/contracts";
import { nickname } from "@/lib/nickname";
import { formatClock, secondsLeft } from "@/lib/time";
import { useAuction, useNow } from "@/lib/useAuction";
import { Card, Chip, PrimaryButton, short } from "@/components/ui-bits";
import { Result } from "./result";

const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(2).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
// Room for the gas fee on top of the bid (130k gas limit at testnet prices is well under this).
const GAS_MARGIN = parseEther("0.02");
// Monad reserve balance: accounts under 10 MON can send about one tx per 1.2 s.
const COOLDOWN_MS = 1500;

type Line =
  | { kind: "confirmed"; seconds: number; hash: Hex }
  | { kind: "outbid"; by: Address; hash?: Hex }
  | { kind: "too-low"; minNext: bigint; spent: boolean }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export default function BidPage() {
  const id = BigInt(useParams<{ id: string }>().id);
  const [burner, setBurner] = useState<ReturnType<typeof getBurner>>();
  useEffect(() => setBurner(getBurner()), []);
  const me = burner?.address;

  const { auction, minNext, balance, blockTs, fetchedAt, refresh } = useAuction(id, me);
  const now = useNow();
  const [sending, setSending] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [line, setLine] = useState<Line>();
  const [chip, setChip] = useState<{ tone: "accent" | "amber" | "grey"; text: string }>();

  // Watch poll-to-poll changes: did I just get outbid? Did the clock just extend?
  const prev = useRef<{ top?: Address; topBid?: bigint; endsAt?: number }>({});
  useEffect(() => {
    if (!auction || !me) return;
    const p = prev.current;
    const isMe = auction.topBidder.toLowerCase() === me.toLowerCase();
    const wasMe = p.top?.toLowerCase() === me.toLowerCase();
    if (wasMe && !isMe && p.topBid !== undefined) {
      setChip({ tone: "amber", text: `Outbid, ${mon(p.topBid)} MON is back in your wallet` });
      setLine({ kind: "outbid", by: auction.topBidder });
      // Find the bid that refunded me, to link the refund tx.
      publicClient
        .getBlockNumber()
        .then((head) =>
          publicClient.getContractEvents({
            address: AUCTION_ADDRESS,
            abi: auctionAbi,
            eventName: "BidPlaced",
            args: { id, prevBidder: me },
            fromBlock: head - 50n,
            toBlock: head,
          }),
        )
        .then((logs) => {
          const hash = logs.at(-1)?.transactionHash;
          if (hash) setLine({ kind: "outbid", by: auction.topBidder, hash });
        })
        .catch(() => {});
    } else if (isMe) {
      setChip({ tone: "accent", text: "You're the top bid" });
    } else if (p.endsAt !== undefined && auction.endsAt > p.endsAt && blockTs !== undefined) {
      setChip({ tone: "grey", text: `Clock extended to ${formatClock(auction.endsAt - blockTs)}` });
    }
    prev.current = { top: auction.topBidder, topBid: auction.topBid, endsAt: auction.endsAt };
  }, [auction, me, id, blockTs]);

  if (!auction || blockTs === undefined || fetchedAt === undefined) {
    return <main className="p-8 text-center text-text-2">Loading auction…</main>;
  }
  if (auction.seller === zeroAddress) {
    return <main className="p-8 text-center text-text-2">Auction #{id.toString()} doesn&apos;t exist.</main>;
  }

  const left = secondsLeft(auction.endsAt, blockTs, fetchedAt, now);
  if (left === 0 || auction.settled) return <Result id={id} auction={auction} me={me} balance={balance} />;

  const total = 60; // progress bar scale: the default auction length
  const lowFunds = balance !== undefined && minNext !== undefined && balance < minNext + GAS_MARGIN;
  const cooling = now < coolUntil;

  async function placeBid() {
    if (!burner || minNext === undefined || !auction) return;
    setSending(true);
    const value = minNext;
    const step = auction.minStep;
    let spent = false;
    try {
      // Dry-run first: catches "someone got there first" without paying gas.
      await publicClient.simulateContract({
        account: burner.account,
        address: AUCTION_ADDRESS,
        abi: auctionAbi,
        functionName: "bid",
        args: [id],
        value,
      });
      spent = true;
      const t0 = performance.now();
      // eth_sendRawTransactionSync: one round trip, returns the receipt.
      const receipt = await burner.walletClient.writeContractSync({
        address: AUCTION_ADDRESS,
        abi: auctionAbi,
        functionName: "bid",
        args: [id],
        value,
        gas: GAS.bid,
        pollingInterval: 200,
      });
      const seconds = (performance.now() - t0) / 1000;
      if (receipt.status === "reverted") {
        // Lost a same-block race: the bid MON never left the wallet, only gas was used.
        setLine({ kind: "too-low", minNext: value + step, spent: true });
      } else {
        setLine({ kind: "confirmed", seconds, hash: receipt.transactionHash });
        setChip({ tone: "accent", text: "You're the top bid" });
      }
    } catch (err) {
      const e = bidError(err);
      if (e.kind === "too-low") setLine({ kind: "too-low", minNext: e.minNext, spent });
      else if (e.kind === "busy") setLine({ kind: "busy" });
      else if (e.kind === "funds") setLine({ kind: "error", message: "Not enough MON for this bid." });
      else if (e.kind === "other") setLine({ kind: "error", message: e.message });
    } finally {
      setCoolUntil(performance.now() + COOLDOWN_MS);
      setSending(false);
      refresh();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col gap-5 px-5 pt-4 pb-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-lg bg-cover bg-center" style={{ backgroundImage: "url(/lot/1.jpg)" }} />
          <div className="flex flex-col">
            <span className="font-mono text-[11px] tracking-widest text-text-2">LOT #{auction.tokenId.toString()}</span>
            <span className="text-[15px] font-semibold">Batik Kawung</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[15px] font-semibold">{me ? nickname(me) : "…"}</span>
          <span className="font-mono text-xs text-text-2">{balance !== undefined ? `${mon(balance)} MON` : "…"}</span>
        </div>
      </header>

      <section className="flex flex-col items-center gap-1 pt-7 pb-5">
        <span className="text-sm text-text-2">Ends in</span>
        <span className="font-mono text-8xl leading-none font-semibold tracking-[-4px]">{formatClock(left)}</span>
        <div className="mt-2 h-1 w-[220px] rounded-sm bg-line">
          <div className="h-1 rounded-sm bg-accent" style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
        </div>
      </section>

      <Card className="flex flex-col gap-3.5 p-5">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-text-2">{auction.topBid === 0n ? "Starting at" : "Top bid"}</span>
            <span className="flex items-end gap-1.5">
              <span className="font-mono text-[40px] leading-none font-semibold tracking-tight">
                {mon(auction.topBid === 0n ? auction.reserve : auction.topBid)}
              </span>
              <span className="font-mono font-medium text-text-2">MON</span>
            </span>
          </div>
          {auction.topBidder !== zeroAddress && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[13px] text-text-2">by</span>
              <span className="text-lg font-semibold">{nickname(auction.topBidder)}</span>
            </div>
          )}
        </div>
        {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
      </Card>

      <div className="flex flex-col gap-2.5 pt-2">
        <PrimaryButton
          className="h-16 text-[19px]"
          disabled={!burner || minNext === undefined || sending || cooling || lowFunds}
          onClick={placeBid}
        >
          {lowFunds ? "Not enough MON" : sending ? "Bidding…" : `Bid ${minNext !== undefined ? mon(minNext) : "…"} MON`}
        </PrimaryButton>
        <StatusLine line={line} />
      </div>
    </main>
  );
}

function StatusLine({ line }: { line?: Line }) {
  if (!line) return null;
  const row = "flex items-center justify-center gap-1.5 text-[13px] text-text-2";
  const link = "flex items-center justify-center gap-1 font-mono text-xs text-accent";
  switch (line.kind) {
    case "confirmed":
      return (
        <>
          <span className={row}>
            <CircleCheck className="size-3.5 text-accent" /> Your last bid confirmed in {line.seconds.toFixed(1)} s
          </span>
          <a className={link} href={txUrl(line.hash)} target="_blank" rel="noreferrer">
            View tx {short(line.hash)} <ArrowUpRight className="size-3" />
          </a>
        </>
      );
    case "outbid":
      return (
        <>
          <span className={row}>
            <Undo2 className="size-3.5 text-accent" /> Refunded in the same tx as {nickname(line.by)}&apos;s bid
          </span>
          {line.hash && (
            <a className={link} href={txUrl(line.hash)} target="_blank" rel="noreferrer">
              View refund tx {short(line.hash)} <ArrowUpRight className="size-3" />
            </a>
          )}
        </>
      );
    case "too-low":
      return (
        <>
          <span className={`${row} font-medium text-text`}>
            <Zap className="size-3.5 text-accent" /> Someone got there first. Tap again for {mon(line.minNext)}
          </span>
          <span className="text-center font-mono text-xs text-text-3">
            {line.spent ? "Your bid MON stayed in your wallet (only gas was used)" : "No MON was spent on that try"}
          </span>
        </>
      );
    case "busy":
      return <span className={row}>Network busy, retrying. Tap again in a moment.</span>;
    case "error":
      return <span className={row}>{line.message}</span>;
  }
}
