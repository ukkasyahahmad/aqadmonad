"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther, parseEther, parseEventLogs, UserRejectedRequestError, BaseError, type Hex } from "viem";
import { useAccount, useBalance, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet, publicClient } from "@/lib/chain";
import { AUCTION_ADDRESS, GAS, NFT_ADDRESS, addressUrl, auctionAbi, nftAbi, txUrl } from "@/lib/contracts";
import { nickname } from "@/lib/nickname";
import { formatClock, secondsLeft } from "@/lib/time";
import { useAuction, useNow } from "@/lib/useAuction";
import { useLatestAuction } from "@/lib/useLatestAuction";
import { Card, PrimaryButton, short } from "@/components/ui-bits";
import { zeroAddress } from "viem";

const TOKEN_KEY = "aqad.host.tokenId";

function errorText(e: unknown) {
  if (e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError))
    return "You rejected it in MetaMask. Try again.";
  return e instanceof BaseError ? e.shortMessage : String(e);
}

function TxLink({ hash, label }: { hash?: Hex; label: string }) {
  if (!hash) return null;
  return (
    <a className="font-mono text-xs text-accent" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label} · tx {short(hash)} ↗
    </a>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-bold text-white">
          {n}
        </span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-text-2">{hint}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function HostPage() {
  const { address, chainId, isConnected } = useAccount();
  const { connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 3000 } });
  const { writeContractAsync } = useWriteContract();
  const latest = useLatestAuction();

  const [tokenId, setTokenId] = useState<bigint>();
  const [mintTx, setMintTx] = useState<Hex>();
  const [approveTx, setApproveTx] = useState<Hex>();
  const [createTx, setCreateTx] = useState<Hex>();
  const [settleTx, setSettleTx] = useState<Hex>();
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const [form, setForm] = useState({ reserve: "0.05", step: "0.01", duration: "60", buffer: "10" });

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setTokenId(BigInt(saved));
  }, []);

  const wrongChain = isConnected && chainId !== monadTestnet.id;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setErr(undefined);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }

  const mint = () =>
    run("mint", async () => {
      const hash = await writeContractAsync({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: "safeMint",
        args: [address!, `${window.location.origin}/lot/1.json`],
        gas: GAS.mint,
      });
      setMintTx(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
      const [transfer] = parseEventLogs({ abi: nftAbi, logs: receipt.logs, eventName: "Transfer" });
      const id = transfer.args.tokenId;
      setTokenId(id);
      setApproveTx(undefined);
      setCreateTx(undefined);
      setSettleTx(undefined);
      localStorage.setItem(TOKEN_KEY, id.toString());
    });

  const approve = () =>
    run("approve", async () => {
      const hash = await writeContractAsync({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: "approve",
        args: [AUCTION_ADDRESS, tokenId!],
        gas: GAS.approve,
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
      setApproveTx(hash);
    });

  const create = () =>
    run("create", async () => {
      const hash = await writeContractAsync({
        address: AUCTION_ADDRESS,
        abi: auctionAbi,
        functionName: "create",
        args: [
          NFT_ADDRESS,
          tokenId!,
          parseEther(form.reserve),
          parseEther(form.step),
          BigInt(form.duration),
          Number(form.buffer),
        ],
        gas: GAS.create,
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
      setCreateTx(hash);
      setSettleTx(undefined);
    });

  return (
    <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-8 py-8 lg:grid-cols-[1fr_380px]">
      <header className="flex items-center justify-between lg:col-span-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold tracking-tight">Aqad Lelang</span>
          <span className="text-text-2">/ Host console</span>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-3 font-mono text-sm text-text-2">
            <span>Monad testnet · {monadTestnet.id}</span>
            <span className="rounded-full border border-line px-3 py-1.5">
              {short(address!)} · {bal ? Number(formatEther(bal.value)).toFixed(2) : "…"} MON
            </span>
          </div>
        ) : (
          <button
            className="h-11 rounded-xl bg-accent px-5 font-semibold text-white"
            onClick={() => connect({ connector: injected() })}
          >
            Connect MetaMask
          </button>
        )}
      </header>

      {wrongChain && (
        <div className="flex items-center justify-between rounded-xl bg-amber-soft p-4 text-amber-ink lg:col-span-2">
          MetaMask is on the wrong network.
          <button className="font-semibold underline" onClick={() => switchChain({ chainId: monadTestnet.id })}>
            Switch to Monad testnet
          </button>
        </div>
      )}
      {err && <div className="rounded-xl bg-amber-soft p-4 text-amber-ink lg:col-span-2">{err}</div>}

      <div className="flex flex-col gap-5">
        <Step n={1} title="Mint the lot" hint="Creates the NFT that will be auctioned. One MetaMask pop-up.">
          {tokenId !== undefined && (
            <div className="flex items-center gap-4">
              <div className="size-14 rounded-lg bg-cover bg-center" style={{ backgroundImage: "url(/lot/1.jpg)" }} />
              <div className="flex flex-col">
                <span className="font-medium">LotNFT #{tokenId.toString()} minted to your wallet.</span>
                <span className="text-sm text-text-2">Batik Kawung, hand-drawn</span>
                <TxLink hash={mintTx} label="tokenURI /lot/1.json" />
              </div>
            </div>
          )}
          <PrimaryButton disabled={!isConnected || wrongChain || !!busy} onClick={mint}>
            {busy === "mint" ? "Minting…" : tokenId === undefined ? "Mint Lot NFT" : "Mint another lot"}
          </PrimaryButton>
        </Step>

        <Step
          n={2}
          title="Approve and create the auction"
          hint="The clock starts when you create. Make sure the room has joined first."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["reserve", "Reserve", "MON"],
                ["step", "Min step", "MON"],
                ["duration", "Duration", "s"],
                ["buffer", "Anti-snipe buffer", "s"],
              ] as const
            ).map(([k, label, unit]) => (
              <label key={k} className="flex flex-col gap-1 text-sm text-text-2">
                {label}
                <span className="flex h-control items-center gap-2 rounded-xl border border-line bg-surface px-3">
                  <input
                    className="w-full bg-transparent font-mono text-text outline-none"
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                  <span className="font-mono text-text-3">{unit}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PrimaryButton
              disabled={tokenId === undefined || wrongChain || !!busy || !!approveTx}
              onClick={approve}
              className={approveTx ? "bg-surface-2 text-text-2 opacity-100" : ""}
            >
              {busy === "approve" ? "Approving…" : approveTx ? "✓ Approved" : "Approve"}
            </PrimaryButton>
            <PrimaryButton disabled={!approveTx || wrongChain || !!busy || !!createTx} onClick={create}>
              {busy === "create" ? "Creating…" : createTx ? "✓ Created" : "Create auction"}
            </PrimaryButton>
          </div>
          {createTx && latest !== undefined && (
            <p className="text-sm">
              Auction #{latest.toString()} is live. The NFT is held by the contract until settle.{" "}
              <TxLink hash={createTx} label="create" />
            </p>
          )}
        </Step>

        {latest !== undefined && (
          <SettleStep id={latest} busy={busy} run={run} settleTx={settleTx} setSettleTx={setSettleTx} wrongChain={wrongChain} />
        )}
      </div>

      <aside className="flex flex-col gap-4">
        {latest !== undefined && <LivePanel id={latest} />}
        <Card className="flex flex-col gap-2 p-5 text-sm">
          <Link className="font-medium text-accent" href="/screen" target="_blank">
            Open big screen /screen ↗
          </Link>
          <Link className="font-medium text-accent" href="/join" target="_blank">
            Phone join link /join ↗
          </Link>
          <a className="font-medium text-accent" href={addressUrl(AUCTION_ADDRESS)} target="_blank" rel="noreferrer">
            Contract on MonadVision ↗
          </a>
        </Card>
      </aside>
    </main>
  );
}

function SettleStep({
  id,
  busy,
  run,
  settleTx,
  setSettleTx,
  wrongChain,
}: {
  id: bigint;
  busy?: string;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  settleTx?: Hex;
  setSettleTx: (h: Hex) => void;
  wrongChain: boolean;
}) {
  const { auction, blockTs, fetchedAt, refresh } = useAuction(id);
  const now = useNow(500);
  const { writeContractAsync } = useWriteContract();
  if (!auction || blockTs === undefined || fetchedAt === undefined) return null;
  const left = secondsLeft(auction.endsAt, blockTs, fetchedAt, now);

  const settle = () =>
    run("settle", async () => {
      const hash = await writeContractAsync({
        address: AUCTION_ADDRESS,
        abi: auctionAbi,
        functionName: "settle",
        args: [id],
        gas: GAS.settle,
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
      setSettleTx(hash);
      refresh();
    });

  return (
    <Step n={3} title="Settle" hint="Anyone can settle after the clock hits zero. One MetaMask pop-up.">
      <PrimaryButton disabled={left > 0 || auction.settled || wrongChain || !!busy} onClick={settle}>
        {busy === "settle" ? "Settling…" : auction.settled ? "✓ Settled" : `Settle auction #${id.toString()}`}
      </PrimaryButton>
      <p className="text-sm text-text-2">
        {auction.settled
          ? auction.topBidder === zeroAddress
            ? "No bids: the NFT went back to you."
            : `The NFT went to ${nickname(auction.topBidder)} and ${formatEther(auction.topBid)} MON to you, in one transaction.`
          : left > 0
            ? `Enabled when the clock ends (${formatClock(left)} left)`
            : "Sends the NFT to the top bidder and the MON to you, in one transaction."}
      </p>
      <TxLink hash={settleTx} label="settle" />
    </Step>
  );
}

function LivePanel({ id }: { id: bigint }) {
  const { auction, blockTs, fetchedAt } = useAuction(id);
  const now = useNow(500);
  if (!auction || blockTs === undefined || fetchedAt === undefined) return null;
  const left = secondsLeft(auction.endsAt, blockTs, fetchedAt, now);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Auction #{id.toString()}</span>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-xs font-semibold text-accent-ink">
          {auction.settled ? "SETTLED" : left > 0 ? "LIVE" : "ENDED"}
        </span>
      </div>
      <span className="font-mono text-5xl font-semibold">{formatClock(left)}</span>
      <div className="flex justify-between text-sm">
        <span className="text-text-2">Top bid</span>
        <span className="font-mono">{formatEther(auction.topBid)} MON</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-text-2">Top bidder</span>
        <span>{auction.topBidder === zeroAddress ? "none yet" : nickname(auction.topBidder)}</span>
      </div>
    </Card>
  );
}
