"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicClient } from "@/lib/chain";

export default function Home() {
  const [block, setBlock] = useState<bigint>();

  useEffect(() => {
    const tick = () => publicClient.getBlockNumber().then(setBlock).catch(() => {});
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Aqad Lelang</h1>
      <p className="font-mono text-sm text-text-2">
        Monad testnet · block {block === undefined ? "…" : block.toLocaleString()}
      </p>
      <nav className="flex flex-col gap-3">
        {[
          ["/join", "Join and bid (phone)"],
          ["/screen", "Big screen"],
          ["/host", "Host console"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="flex h-control items-center rounded-xl border border-line bg-surface px-5 font-medium"
          >
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
