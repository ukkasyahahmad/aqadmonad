"use client";

import { Ban, BellRing, CheckCircle2, Flag, Hourglass, Loader2, PartyPopper, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useBurner } from "@/hooks/use-burner";
import type { Lot } from "@/hooks/use-auctions";
import { useTx } from "@/hooks/use-tx";
import { nickname } from "@/lib/burner";
import { auctionHouse, minNextBid, ZERO } from "@/lib/contracts";
import { formatCountdown, formatMon, formatWhen, parseMon, shortAddr } from "@/lib/format";
import { lotTitle } from "./auction-card";
import { Confetti } from "./confetti";
import { Btn, Card, Notice, Pill, StatePill, Tag, TxLink, inputCls, type LotState } from "./kit";
import { WalletGate } from "./wallet";

const noopSubscribe = () => () => {};

type Props = { lot: Lot; state: LotState; now: number | null; bidCount: number; onChanged: () => void };

/**
 * Bid panel states (html-design bid-interaction-state): S1 ready, S2 confirm dialog,
 * S3 pending, S4 leading, S5 price changed, S6 invalid, S7 ended, S8 cancelled.
 * Every state is derived from on-chain data or a real transaction — nothing is simulated.
 */
export function BidPanel({ lot, state, now, bidCount, onChanged }: Props) {
  const { address: walletAddress } = useAccount();
  const burner = useBurner();
  // Phones that scanned the QR have no injected wallet: default to the quick-bid wallet.
  const hasInjected = useSyncExternalStore(noopSubscribe, () => "ethereum" in window, () => true);
  const [chosenMode, setMode] = useState<"quick" | "wallet" | null>(null);
  const mode = chosenMode ?? (hasInjected ? "wallet" : "quick");
  const quickMode = mode === "quick";
  const address = quickMode ? burner.account?.address : walletAddress;

  const bidTx = useTx(quickMode ? burner.account : null);
  const withdrawTx = useTx(quickMode ? burner.account : null);
  const settleTx = useTx(); // only the seller closes, from the MetaMask wallet that listed the item
  const cancelTx = useTx();
  const { data: owedRaw, refetch: refetchOwed } = useReadContract({
    address: auctionHouse?.address,
    abi: auctionHouse?.abi,
    functionName: "pendingReturns",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 3000 },
  });
  const owed = (owedRaw as bigint | undefined) ?? 0n; // refundable MON of the active signer

  const required = minNextBid(lot);
  const [typed, setInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [priceChanged, setPriceChanged] = useState<{ was: bigint; attempted: bigint } | null>(null);
  // The field shows the current minimum until the user edits it.
  const input = touched ? typed : formatEther(required);

  // S5 (derived during render): the minimum rose above what the user had typed.
  const [prevRequired, setPrevRequired] = useState(required);
  if (required !== prevRequired) {
    setPrevRequired(required);
    const p = parseMon(typed);
    if (required > prevRequired && touched && p.ok && p.wei < required) {
      setPriceChanged({ was: prevRequired, attempted: p.wei });
      setTouched(false);
    }
  }

  const parsed = parseMon(input);
  const tooLow = parsed.ok && parsed.wei < required;
  const left = now === null ? null : Number(lot.endTime) - now;
  const me = address?.toLowerCase();
  const isSeller = !!me && me === lot.seller.toLowerCase();
  const sellerWallet = !!walletAddress && walletAddress.toLowerCase() === lot.seller.toLowerCase();
  const isLeader = !!me && lot.highestBidder !== ZERO && me === lot.highestBidder.toLowerCase();
  const pending = bidTx.busy || withdrawTx.busy;
  const hasBids = lot.highestBid > 0n;
  const shownBids = Math.max(bidCount, hasBids ? 1 : 0); // history can lag the auction state

  // Did this signer lead at some point while watching? Then losing the lead = "outbid".
  const [led, setLed] = useState<string | null>(null);
  if (isLeader && me && led !== me) setLed(me);
  const participated = !!me && (led === me || owed > 0n);
  const outbid = participated && !isLeader && hasBids && !isSeller;
  const won = state === "settled" && isLeader;
  const lost = state === "settled" && participated && !isLeader;

  // Phone feedback: vibrate when outbid or when you win (where supported).
  useEffect(() => {
    if ((outbid && state !== "settled") || won) {
      try {
        navigator.vibrate?.(won ? [120, 80, 120, 80, 300] : [200, 100, 200]);
      } catch {}
    }
  }, [outbid, won, state]);

  async function withdrawRefund() {
    const r = await withdrawTx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "withdraw", args: [] });
    refetchOwed();
    if (quickMode) burner.refetch();
    return r;
  }

  async function placeBid() {
    if (!parsed.ok || tooLow) return;
    const amount = parsed.wei;
    setConfirming(false);
    setPriceChanged(null);
    // Quick wallet short on MON but holding a refund: withdraw it first, then bid (feels like one step).
    const GAS_BUFFER = 10n ** 16n; // 0.01 MON headroom for gas
    if (quickMode && owed > 0n && burner.balance < amount + GAS_BUFFER) {
      if (!(await withdrawRefund())) return;
      await new Promise((s) => setTimeout(s, 1500)); // Monad reserve balance: ~3 blocks between txs
    }
    const r = await bidTx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "bid", args: [lot.id], value: amount });
    onChanged();
    if (quickMode) burner.refetch();
    if (r) {
      setTouched(false);
      // Monad reserve-balance rule: a low-balance account may send one tx per ~3 blocks.
      setCooldown(true);
      setTimeout(() => setCooldown(false), 1500);
    } else if (bidTx.lastErrorName.current === "BidTooLow") {
      // Simulation reverted with BidTooLow → someone bid first (S5). Refill with the new minimum.
      setPriceChanged({ was: required, attempted: amount });
      setTouched(false);
    }
  }

  const quick = [
    ["Min", required],
    ["+10%", required + required / 10n],
    ["+25%", required + required / 4n],
  ] as const;

  // ---------------------------------------------------------------- S7 ended / S8 cancelled
  if (state === "settled" || state === "cancelled" || state === "awaiting") {
    const cancelled = state === "cancelled";
    return (
      <Card className="space-y-5">
        {won && <Confetti fixed />}
        <div className="flex items-center justify-between">
          <StatePill state={state} />
          <Tag>On-chain</Tag>
        </div>
        {won && (
          <div className="pop-in rounded-2xl bg-primary p-5 text-primary-foreground">
            <p className="flex items-center gap-2 text-2xl font-semibold"><PartyPopper className="size-6" /> You won!</p>
            <p className="mt-1 text-sm">The NFT is in your wallet. Settled on-chain for {formatMon(lot.highestBid)} MON.</p>
          </div>
        )}
        {state === "awaiting" && isLeader && (
          <Notice tone="success" title="You hold the winning bid">The auction is over; the NFT moves to you when the seller settles.</Notice>
        )}
        {lost && (
          <Notice tone="success" title="Auction finished — your MON is safe">
            {owed > 0n ? `${formatMon(owed)} MON is ready to withdraw below.` : "Your outbid MON has already been withdrawn."}
          </Notice>
        )}
        <div>
          <p className="text-sm text-muted-foreground">{hasBids ? (state === "awaiting" ? "Highest bid" : "Winning bid") : "Starting price"}</p>
          <p className="font-mono text-[40px] font-semibold leading-tight tracking-tight">{formatMon(hasBids ? lot.highestBid : lot.minPrice)} MON</p>
          <p className="text-sm text-muted-foreground">
            {hasBids ? `${shownBids} bid${shownBids === 1 ? "" : "s"} · ${state === "awaiting" ? "leading" : "winner"} ${shortAddr(lot.highestBidder)}` : "No bids were placed"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Bidding" value="Closed" sub={cancelled ? "Auction cancelled" : "No further bids"} />
          <Stat label={cancelled ? "Cancelled" : "Ended"} value={cancelled ? "By seller" : formatWhen(lot.endTime).split(" · ")[0].split(", ").pop() ?? ""} sub={formatWhen(lot.endTime)} />
        </div>

        {cancelled ? (
          <Notice tone="danger" title="This auction was cancelled">The seller cancelled before the first bid. The NFT was returned to the seller.</Notice>
        ) : state === "settled" ? (
          <Notice tone="success" title={hasBids ? "Settled on-chain" : "Ended with no bids"}>
            {hasBids
              ? `The NFT was transferred to ${shortAddr(lot.highestBidder)} and ${formatMon(lot.highestBid)} MON was paid to the seller.`
              : "The NFT was returned to the seller."}{" "}
            {settleTx.hash && <TxLink hash={settleTx.hash} />}
          </Notice>
        ) : (
          <div className="space-y-3">
            {sellerWallet ? (
              <>
                <Notice tone="warning" title="Time is up — close your auction">
                  Nothing moves until you send the closing transaction: the NFT goes to the winner and the MON to you.
                </Notice>
                <Btn className="w-full" variant="dark" loading={settleTx.busy} disabled={settleTx.busy} onClick={async () => {
                  await settleTx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "endAuction", args: [lot.id] });
                  onChanged();
                }}>
                  {settleTx.phase === "signing" ? "Confirm in wallet…" : settleTx.phase === "confirming" ? "Closing on Monad…" : "Close auction & settle"}
                </Btn>
              </>
            ) : (
              <Notice tone="warning" title="Time is up — waiting for the seller">
                Bidding is closed. The seller closes the auction, which sends the NFT to the winner and the MON to the seller.
              </Notice>
            )}
            {settleTx.error && <Notice tone="danger">{settleTx.error}</Notice>}
          </div>
        )}

        {state !== "awaiting" && (
          <div className="flex h-[52px] items-center justify-center gap-2 rounded-xl bg-secondary font-semibold text-subtle-foreground">
            {cancelled ? <>Auction cancelled <Ban className="size-4" /></> : <>Auction ended <Flag className="size-4" /></>}
          </div>
        )}
        {owed > 0n && <WithdrawBurner amount={owed} tx={withdrawTx} onDone={() => { refetchOwed(); burner.refetch(); }} />}
        <p className="flex gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <Hourglass className="size-4 shrink-0" /> Final price is the winning bid only. Network gas is not included.
        </p>
      </Card>
    );
  }

  // ---------------------------------------------------------------- S1–S6 live
  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        {pending ? (
          <Pill tone="warning" icon={<Loader2 className="size-3.5 animate-spin" />}>Live · bid pending</Pill>
        ) : (
          <StatePill state={state} />
        )}
        <Tag>Testnet MON</Tag>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{hasBids ? "Current highest bid" : "Starting price"}</p>
        <p className="font-mono text-[40px] font-semibold leading-tight tracking-tight">{formatMon(hasBids ? lot.highestBid : lot.minPrice)} MON</p>
        <p className="text-sm text-muted-foreground">
          {hasBids ? <>{shownBids} bid{shownBids === 1 ? "" : "s"} · {isLeader ? "you are leading" : <>leading bidder <span className="font-mono">{shortAddr(lot.highestBidder)}</span></>}</> : "No bids yet"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Minimum next bid" value={`${formatMon(required)} MON`} sub={priceChanged ? `Was ${formatMon(priceChanged.was)} MON` : hasBids ? "Increment +5%, rounded up" : "First bid may equal start"} />
        <Stat label="Ends in" value={formatCountdown(left ?? 0)} sub={formatWhen(lot.endTime)} />
      </div>

      {outbid && !pending && (
        <div role="alert" className="pop-in space-y-3 rounded-2xl border-2 border-foreground bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-lg font-semibold"><BellRing className="size-5" /> You&apos;ve been outbid!</p>
          <p className="text-sm">
            {owed > 0n
              ? `Your ${formatMon(owed)} MON is safe in the contract — withdraw it any time, or bid again now.`
              : "Bid again to take the lead."}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Btn size="md" disabled={cooldown} onClick={() => { setTouched(true); setInput(formatEther(required)); setPriceChanged(null); setConfirming(true); }}>
              Bid again · {formatMon(required)} MON
            </Btn>
            {owed > 0n && (
              <Btn size="md" variant="secondary" loading={withdrawTx.busy} disabled={withdrawTx.busy} onClick={withdrawRefund}>
                Withdraw {formatMon(owed)} MON
              </Btn>
            )}
          </div>
        </div>
      )}

      {!outbid && owed > 0n && !pending && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-soft p-3 text-sm text-success">
          <span>Refund from an earlier bid: <b>{formatMon(owed)} MON</b></span>
          <Btn size="md" variant="dark" loading={withdrawTx.busy} disabled={withdrawTx.busy} onClick={withdrawRefund}>Withdraw</Btn>
        </div>
      )}

      {state === "ending" && <Notice tone="warning">Under 60 s left — any bid now moves the end to 60 s after that bid.</Notice>}

      {/* signer switch */}
      <div className="flex rounded-xl bg-secondary p-1 text-sm font-semibold" role="tablist" aria-label="Bid with">
        {(["quick", "wallet"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} disabled={pending} onClick={() => setMode(m)}
            className={`h-10 flex-1 rounded-lg ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            {m === "quick" ? "Quick-bid wallet" : "MetaMask"}
          </button>
        ))}
      </div>
      {quickMode && <BurnerBox burner={burner} required={required} />}

      {/* S3 pending */}
      {pending && (
        <Notice tone="warning" title={withdrawTx.busy ? "Withdrawing your refund first…" : bidTx.phase === "signing" ? "Waiting for your signature…" : "Submitting your bid to Monad…"}>
          {bidTx.phase === "signing" ? "Approve the transaction in your wallet." : quickMode ? "Sent with eth_sendRawTransactionSync — the receipt comes back in the same request." : "Waiting for the transaction receipt."}
        </Notice>
      )}

      {/* S4 leading */}
      {!pending && isLeader && (
        <Notice tone="success" title="You're the leading bidder">
          {bidTx.phase === "success" && bidTx.receiptMs !== null ? `Confirmed on-chain — ${quickMode ? "sync receipt" : "receipt"} in ${bidTx.receiptMs} ms (measured here). ` : ""}
          This wallet can&apos;t bid again until someone outbids you. If outbid, your full bid becomes withdrawable. {bidTx.hash && <TxLink hash={bidTx.hash} />}
        </Notice>
      )}

      {/* S5 price changed */}
      {!pending && priceChanged && !isLeader && (
        <Notice tone="warning" title="Your bid wasn't placed — the price changed">
          Another bid landed first. Your {formatMon(priceChanged.attempted)} MON was not submitted. New minimum: {formatMon(required)} MON.
        </Notice>
      )}
      {!pending && bidTx.error && !priceChanged && <Notice tone="danger">{bidTx.error}</Notice>}

      {isSeller ? (
        <Notice title="Your auction">Sellers can&apos;t bid on their own lot. You can cancel only while there are no bids.</Notice>
      ) : (
        !isLeader && (
          <SignerGate quick={quickMode} burnerReady={!!burner.account && burner.balance > 0n} action="bid">
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Your bid</span>
                <div className="relative">
                  <input inputMode="decimal" className={`${inputCls(tooLow || !parsed.ok)} pr-16 font-mono`} value={input} disabled={pending}
                    onChange={(e) => { setTouched(true); setInput(e.target.value); setPriceChanged(null); bidTx.reset(); }} aria-describedby="bid-help" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">MON</span>
                </div>
                <span id="bid-help" className={`block text-xs ${!parsed.ok || tooLow ? "text-destructive" : "text-muted-foreground"}`}>
                  {!parsed.ok ? parsed.error : priceChanged ? "Updated to the new minimum. Review before bidding again." : `Enter ${formatMon(required)} MON or more.`}
                </span>
              </label>
              <div className="flex gap-2">
                {quick.map(([label, wei]) => (
                  <button key={label} type="button" disabled={pending} onClick={() => { setTouched(true); setInput(formatEther(wei)); setPriceChanged(null); }}
                    className="h-11 rounded-full border border-border-strong px-4 font-mono text-xs font-semibold hover:bg-secondary">
                    {label === "Min" ? `Min ${formatMon(wei)}` : label}
                  </button>
                ))}
              </div>
              <Btn className="w-full" loading={pending} disabled={!parsed.ok || tooLow || pending || cooldown} onClick={() => setConfirming(true)}>
                {pending ? "Pending…" : cooldown ? "Ready in a moment…" : !parsed.ok || tooLow ? "Enter a valid bid" : priceChanged ? `Review bid at ${formatMon(parsed.wei)} MON` : "Review bid"}
              </Btn>
            </div>
          </SignerGate>
        )
      )}

      {sellerWallet && (
        <div className="space-y-2">
          <Btn className="w-full" variant="dark" loading={settleTx.busy} disabled={settleTx.busy} onClick={async () => {
            await settleTx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "endAuction", args: [lot.id] });
            onChanged();
          }}>
            {settleTx.phase === "signing" ? "Confirm in wallet…" : settleTx.phase === "confirming" ? "Closing on Monad…" : hasBids ? `End now & accept ${formatMon(lot.highestBid)} MON` : "End now (no bids)"}
          </Btn>
          {settleTx.error && <Notice tone="danger">{settleTx.error}</Notice>}
        </div>
      )}

      {isSeller && lot.highestBid === 0n && (
        <div className="space-y-2">
          <Btn className="w-full" variant="secondary" loading={cancelTx.busy} disabled={cancelTx.busy} onClick={async () => {
            await cancelTx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "cancelAuction", args: [lot.id] });
            onChanged();
          }}>Cancel auction (no bids yet)</Btn>
          {cancelTx.error && <Notice tone="danger">{cancelTx.error}</Notice>}
        </div>
      )}

      <p className="text-xs text-muted-foreground">The current bid is not a total cost. Network gas is extra; the contract charges no other fees.</p>
      <div className="flex gap-3 border-t border-border pt-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">If you win:</span> at settlement the token moves from the auction contract to your wallet and your MON goes to the seller.
        </p>
      </div>

      {confirming && parsed.ok && (
        <ConfirmDialog
          amount={parsed.wei}
          title={lotTitle(lot)}
          current={lot.highestBid}
          required={required}
          endTime={lot.endTime}
          signer={quickMode ? "Quick-bid wallet (signed in this browser)" : "MetaMask"}
          onCancel={() => setConfirming(false)}
          onConfirm={placeBid}
        />
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-secondary p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** S2: shows the exact amount before the wallet prompt. Esc and ✕ close it. */
function ConfirmDialog(p: {
  amount: bigint;
  title: string;
  current: bigint;
  required: bigint;
  endTime: bigint;
  signer: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-foreground/50 p-4" onClick={p.onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="m-auto w-full max-w-sm space-y-4 rounded-3xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Tag>Real bid</Tag>
            <h3 id="confirm-title" className="text-xl font-semibold">Confirm your bid</h3>
          </div>
          <button aria-label="Close" onClick={p.onCancel} className="grid size-11 place-items-center rounded-full hover:bg-secondary"><X className="size-5" /></button>
        </div>
        <div className="rounded-2xl bg-primary p-4">
          <p className="text-sm font-medium">You are bidding</p>
          <p className="font-mono text-[32px] font-semibold leading-tight">{formatMon(p.amount)} MON</p>
          <p className="text-sm">on {p.title}</p>
        </div>
        <dl className="divide-y divide-border text-sm">
          {[
            ["Current highest bid", p.current > 0n ? `${formatMon(p.current)} MON` : "No bids yet"],
            ["Minimum next bid", `${formatMon(p.required)} MON`],
            ["Auction ends", formatWhen(p.endTime).split(" · ")[0]],
            ["Signer", p.signer],
            ["Fees", "Network gas only"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-mono text-xs font-semibold">{v}</dd></div>
          ))}
        </dl>
        <p className="flex gap-2 rounded-2xl bg-secondary p-3 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 shrink-0" /> This sends real test MON on Monad Testnet. If you are outbid, your full bid becomes withdrawable from the contract.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="secondary" onClick={p.onCancel}>Cancel</Btn>
          <Btn ref={confirmRef} onClick={p.onConfirm}>Confirm bid</Btn>
        </div>
      </div>
    </div>
  );
}

function SignerGate({ quick, burnerReady, action, children }: { quick: boolean; burnerReady: boolean; action: string; children: React.ReactNode }) {
  if (quick) return burnerReady ? <>{children}</> : null;
  return <WalletGate action={action}>{children}</WalletGate>;
}

function BurnerBox({ burner, required }: { burner: ReturnType<typeof useBurner>; required: bigint }) {
  if (!burner.account) {
    return (
      <div className="space-y-2 rounded-2xl border border-border p-3 text-sm">
        <p className="text-muted-foreground">A throwaway wallet made in this browser for test MON. Not for real funds — its key lives in this browser&apos;s storage.</p>
        <Btn className="w-full" variant="dark" onClick={burner.create}>Create quick-bid wallet</Btn>
      </div>
    );
  }
  const funding = burner.phase === "requesting" || burner.phase === "settling";
  return (
    <div className="space-y-2 rounded-2xl border border-border p-3 text-sm">
      <div className="flex items-center justify-between">
        <span><span className="font-semibold">{nickname(burner.account.address)}</span> <span className="font-mono text-xs text-muted-foreground">{shortAddr(burner.account.address)}</span></span>
        <span className="font-mono">{formatMon(burner.balance, 3)} MON</span>
      </div>
      {burner.balance < required + 10n ** 16n && (
        <Btn className="w-full" variant="dark" loading={funding} disabled={funding} onClick={burner.fund}>
          {burner.phase === "requesting" ? "Requesting test MON…" : burner.phase === "settling" ? "Funds arriving…" : "Get 1 test MON"}
        </Btn>
      )}
      {burner.error && <p className="text-xs text-destructive">{burner.error}</p>}
      <p className="text-xs text-muted-foreground">Signed in this browser and sent with Monad&apos;s eth_sendRawTransactionSync.</p>
    </div>
  );
}

function WithdrawBurner({ amount, tx, onDone }: { amount: bigint; tx: ReturnType<typeof useTx>; onDone: () => void }) {
  return (
    <div className="space-y-1">
      <Btn className="w-full" variant="secondary" size="md" loading={tx.busy} disabled={tx.busy} onClick={async () => {
        await tx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "withdraw", args: [] });
        onDone();
      }}>Outbid — withdraw {formatMon(amount)} MON refund</Btn>
      {tx.error && <p className="text-xs text-destructive">{tx.error}</p>}
    </div>
  );
}
