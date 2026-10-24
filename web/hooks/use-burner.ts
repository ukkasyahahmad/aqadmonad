"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { useBalance, usePublicClient } from "wagmi";
import { BURNER_KEY, createBurner, loadBurner } from "@/lib/burner";

const burnerListeners = new Set<() => void>();
function subscribeBurner(cb: () => void) {
  burnerListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    burnerListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readBurnerKey(): string | null {
  try {
    return localStorage.getItem(BURNER_KEY);
  } catch {
    return null;
  }
}

export type FundPhase = "idle" | "requesting" | "settling" | "funded" | "error";

/**
 * Quick-bid wallet state: the browser-local key, its MON balance, and a faucet request.
 * After funding we wait 1.5 s before enabling bids: on Monad a newly funded account can't
 * send until the funding is ~3 blocks old (async execution / reserve balance rules).
 */
export function useBurner() {
  // localStorage is an external store: subscribe so every component sees the same burner.
  const stored = useSyncExternalStore(subscribeBurner, readBurnerKey, () => null);
  const account: PrivateKeyAccount | null = useMemo(() => (stored ? loadBurner() : null), [stored]);
  const [phase, setPhase] = useState<FundPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fundTx, setFundTx] = useState<string | null>(null);
  const client = usePublicClient();
  const { data: balance, refetch } = useBalance({
    address: account?.address,
    query: { enabled: Boolean(account), refetchInterval: 3000 },
  });

  const create = () => {
    if (!loadBurner()) createBurner();
    burnerListeners.forEach((l) => l());
  };

  async function fund() {
    if (!account) return;
    setError(null);
    setPhase("requesting");
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Faucet failed.");
      setFundTx(data.txHash);
      await client!.waitForTransactionReceipt({ hash: data.txHash, pollingInterval: 250 });
      setPhase("settling");
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
      setPhase("funded");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Faucet failed.");
    }
  }

  return { account, balance: balance?.value ?? 0n, create, fund, phase, error, fundTx, refetch };
}
