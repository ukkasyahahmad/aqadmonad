"use client";

import { Bookmark, ChevronDown, CircleUser, Gavel, LogOut, Tag, Wallet } from "lucide-react";
import Link from "next/link";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { targetChain } from "@/lib/chain";
import { formatMon, shortAddr } from "@/lib/format";
import { Btn } from "./kit";
import { metamaskDeepLink } from "./qr";

/** Avoids SSR/client mismatch for wallet state (wallets only exist in the browser). */
const noopSubscribe = () => () => {};
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 4000 } });

  if (!mounted) return <div className="h-11 w-36" />;

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <div className="flex flex-col items-end">
        <Btn size="md" variant="dark" loading={isPending} onClick={() => injected && connect({ connector: injected })}>
          <Wallet className="size-4" /> Connect wallet
        </Btn>
        {error && <span className="mt-1 text-xs text-destructive">{/rejected/i.test(error.message) ? "Connection rejected." : "No browser wallet found. Install MetaMask."}</span>}
      </div>
    );
  }

  if (chainId !== targetChain.id) {
    return (
      <Btn size="md" variant="primary" loading={switching} onClick={() => switchChain({ chainId: targetChain.id })}>
        Switch to {targetChain.name}
      </Btn>
    );
  }

  return <AccountMenu address={address!} balance={bal?.value} onDisconnect={() => disconnect()} />;
}

/** W4 account menu: real address, network and balance, links, disconnect. */
function AccountMenu({ address, balance, onDisconnect }: { address: string; balance?: bigint; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const { ids } = useWatchlist();
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 items-center gap-2 rounded-full border border-border-strong bg-card px-3 text-sm"
      >
        <CircleUser className="size-4" />
        <span className="font-mono">{shortAddr(address)}</span>
        <ChevronDown className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-80 rounded-3xl border border-border bg-card p-2 shadow-[0_12px_32px_rgba(16,24,20,0.16)]">
            <div className="space-y-2 p-3">
              <p className="font-mono text-sm font-semibold">{shortAddr(address)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Network</dt>
                <dd className="text-right font-medium">{targetChain.name} · {targetChain.id}</dd>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="text-right font-mono font-medium">{balance === undefined ? "…" : `${formatMon(balance, 4)} MON`}</dd>
              </dl>
            </div>
            <div className="border-t border-border pt-1">
              {[
                ["/account#bids", "My bids", Gavel],
                ["/account#listings", "My listings", Tag],
                ["/account#watchlist", `Watchlist · ${ids.length}`, Bookmark],
              ].map(([href, label, Icon]) => {
                const I = Icon as typeof Gavel;
                return (
                  <Link key={href as string} href={href as string} role="menuitem" onClick={() => setOpen(false)} className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-secondary">
                    <I className="size-4" /> {label as string}
                  </Link>
                );
              })}
              <button role="menuitem" onClick={() => { setOpen(false); onDisconnect(); }} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-destructive hover:bg-destructive-soft">
                <LogOut className="size-4" /> Disconnect wallet
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Inline gate for write actions: connect → right network → children. */
export function WalletGate({ children, action = "continue" }: { children: React.ReactNode; action?: string }) {
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  if (!mounted) return null;
  if (!isConnected) {
    // Phones that scanned the QR usually have no injected wallet: offer MetaMask's in-app browser.
    const hasInjected = typeof window !== "undefined" && "ethereum" in window;
    if (!hasInjected) {
      return (
        <div className="space-y-2">
          <a
            href={metamaskDeepLink() ?? "#"}
            className="flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-foreground px-4 text-[15px] font-semibold text-background"
          >
            <Wallet className="size-4 shrink-0" /> Open in MetaMask
          </a>
          <p className="text-center text-xs text-muted-foreground">No wallet in this browser — open the MetaMask app to {action}.</p>
        </div>
      );
    }
    return (
      <Btn className="w-full" variant="dark" loading={isPending} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
        <Wallet className="size-4 shrink-0" /> Connect wallet
      </Btn>
    );
  }
  if (chainId !== targetChain.id)
    return (
      <Btn className="w-full" loading={switching} onClick={() => switchChain({ chainId: targetChain.id })}>
        Switch to {targetChain.name}
      </Btn>
    );
  return <>{children}</>;
}
