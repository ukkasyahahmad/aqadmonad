"use client";

import { useEffect, useState } from "react";

export function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function TopBar({ label, head }: { label: string; head?: bigint }) {
  return (
    <header className="flex items-center justify-between border-b border-stage-line px-12 py-6">
      <div className="flex items-center gap-4">
        <span className="text-2xl font-bold tracking-tight">Aqad Lelang</span>
        <span className="flex items-center gap-2 rounded-full bg-accent px-3 py-1 font-mono text-sm font-semibold tracking-widest">
          <span className="size-2 rounded-full bg-white" />
          {label}
        </span>
      </div>
      <span className="font-mono text-base text-stage-text-2">
        Monad testnet{head !== undefined && ` · block ${head.toLocaleString()}`}
      </span>
    </header>
  );
}
