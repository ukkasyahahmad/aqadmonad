"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { publicClient } from "@/lib/chain";
import { AUCTION_ADDRESS, auctionAbi } from "@/lib/contracts";
import { useLatestAuction } from "@/lib/useLatestAuction";
import { TopBar, useOrigin } from "@/components/stage";

const STEPS = [
  "You get 1 test MON and a nickname. No sign-up.",
  "Tap Bid. Your MON is locked in the contract.",
  "Outbid? Your MON comes back in the same transaction.",
];

/** Lobby: QR to /join. Jumps to the live screen as soon as the host creates an auction. */
export default function Lobby() {
  const router = useRouter();
  const origin = useOrigin();
  const latest = useLatestAuction();

  useEffect(() => {
    if (latest === undefined) return;
    // Only follow an auction that's still running; an ended one means "between rehearsals".
    Promise.all([
      publicClient.readContract({ address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "auctions", args: [latest] }),
      publicClient.getBlock(),
    ])
      .then(([a, block]) => {
        const [, , , , , endsAt, , , , settled] = a;
        if (!settled && BigInt(endsAt) > block.timestamp) router.replace(`/screen/${latest}`);
      })
      .catch(() => {});
  }, [latest, router]);

  return (
    <main className="flex h-screen flex-col bg-stage text-stage-text">
      <TopBar label="STARTING SOON" />
      <section className="flex flex-1 items-center gap-20 px-20">
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-3xl bg-white p-6">{origin && <QRCodeSVG value={`${origin}/join`} size={360} />}</div>
          <span className="font-mono text-2xl">{origin.replace(/^https?:\/\//, "")}/join</span>
        </div>
        <div className="flex flex-col gap-10">
          <h1 className="max-w-3xl text-6xl leading-tight font-bold tracking-tight">
            Scan to join. Every bid is real money, locked on-chain.
          </h1>
          <ol className="flex flex-col gap-5">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-5 text-3xl">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent font-mono font-bold">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-5 rounded-2xl border border-stage-line bg-stage-2 p-4">
            <div className="size-20 rounded-xl bg-cover bg-center" style={{ backgroundImage: "url(/lot/1.jpg)" }} />
            <div>
              <div className="font-mono text-lg tracking-widest text-stage-text-2">LOT #1 · reserve 0.05 MON</div>
              <div className="text-3xl font-bold">Batik Kawung, hand-drawn</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
