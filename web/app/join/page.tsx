"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { LoaderCircle, CircleCheck } from "lucide-react";
import { getBurner } from "@/lib/burner";
import { publicClient } from "@/lib/chain";
import { nickname } from "@/lib/nickname";
import { useLatestAuction } from "@/lib/useLatestAuction";
import { Card, NetworkPill, PrimaryButton, short } from "@/components/ui-bits";

type Drip = "loading" | "ready" | "empty" | "error";

export default function JoinPage() {
  const router = useRouter();
  const latest = useLatestAuction();
  const [me, setMe] = useState<Address>();
  const [drip, setDrip] = useState<Drip>("loading");
  const [balance, setBalance] = useState<bigint>();

  useEffect(() => {
    const { address } = getBurner();
    setMe(address);
    (async () => {
      try {
        const res = await fetch("/api/drip", { method: "POST", body: JSON.stringify({ address }) });
        const body = await res.json();
        if (res.status === 429 && body.reason === "cap") return setDrip("empty");
        if (!body.ok) return setDrip("error");
        // Monad reserve balance: a newly funded account must wait ~1.2 s before sending.
        await new Promise((r) => setTimeout(r, 1500));
        setBalance(await publicClient.getBalance({ address }));
        setDrip("ready");
      } catch {
        setDrip("error");
      }
    })();
  }, []);

  // Join first, then list: as soon as the host creates the auction, go to it.
  useEffect(() => {
    if (drip === "ready" && latest !== undefined) router.replace(`/a/${latest}`);
  }, [drip, latest, router]);

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col gap-6 px-5 pt-4 pb-8">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-bold tracking-tight">Aqad Lelang</span>
        <NetworkPill />
      </header>

      <div
        className="flex h-[350px] flex-col justify-end rounded-2xl bg-cover bg-center p-3"
        style={{ backgroundImage: "url(/lot/1.jpg)" }}
      >
        <span className="self-start rounded-lg bg-[#1C1917CC] px-2.5 py-1.5 font-mono text-xs font-medium tracking-widest text-white">
          LOT #1
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold tracking-tight">Batik Kawung, hand-drawn</h1>
        <p className="font-mono text-[13px] text-text-2">Reserve 0.05 MON · steps of 0.01 MON</p>
      </div>

      <Card>
        <div className="flex items-center justify-between p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-text-2">You&apos;re bidding as</span>
            <span className="text-[22px] font-bold tracking-tight">{me ? nickname(me) : "…"}</span>
          </div>
          {me && <span className="font-mono text-xs text-text-3">{short(me)}</span>}
        </div>
        <div className="h-px bg-line" />
        <div className="flex items-center gap-3 p-4">
          {drip === "ready" ? (
            <CircleCheck className="size-5 text-accent" />
          ) : (
            <LoaderCircle className={drip === "loading" ? "size-5 animate-spin text-accent" : "size-5 text-text-3"} />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium">
              {drip === "loading" && "Getting you 1 test MON…"}
              {drip === "ready" && `${Number(formatEther(balance ?? 0n)).toFixed(2)} MON ready`}
              {drip === "empty" && "The test-MON tap is empty. Ask the host."}
              {drip === "error" && "Couldn't get test MON. Pull to refresh and try again."}
            </span>
            <span className="text-[13px] text-text-2">Free testnet coins. Not real money.</span>
          </div>
        </div>
      </Card>

      <p className="text-[13px] leading-relaxed text-text-2">
        When you bid, your MON is locked in the contract until someone outbids you. If that happens, it comes back
        in the same transaction.
      </p>

      <PrimaryButton
        disabled={drip !== "ready" || latest === undefined}
        onClick={() => latest !== undefined && router.push(`/a/${latest}`)}
      >
        {drip !== "ready" ? "Join the auction" : latest === undefined ? "Waiting for the auction to start" : "Go to the auction"}
      </PrimaryButton>
    </main>
  );
}
