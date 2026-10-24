"use client";

import { useCallback, useSyncExternalStore } from "react";

// Watchlist = auction IDs saved in this browser only (a per-viewer convenience, not on-chain).
const KEY = "live-auction.watchlist.v1";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useWatchlist() {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  let ids: string[] = [];
  try {
    ids = JSON.parse(raw);
  } catch {}
  const toggle = useCallback((id: bigint) => {
    const cur: string[] = JSON.parse(read());
    const s = id.toString();
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    listeners.forEach((l) => l());
  }, []);
  return { ids, has: (id: bigint) => ids.includes(id.toString()), toggle };
}
