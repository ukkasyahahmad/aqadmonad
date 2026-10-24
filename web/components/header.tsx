import Link from "next/link";
import { targetChain } from "@/lib/chain";
import { auctionHouse } from "@/lib/contracts";
import { LogoMark } from "./logo";
import { RefundBanner } from "./refund-banner";
import { WalletButton } from "./wallet";

export function Header() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1312px] items-center gap-3 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight">Aqad</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 text-sm font-medium md:flex">
            <Link className="rounded-lg px-3 py-2 hover:bg-secondary" href="/">Explore</Link>
            <Link className="rounded-lg px-3 py-2 hover:bg-secondary" href="/create">Sell an item</Link>
            <Link className="rounded-lg px-3 py-2 hover:bg-secondary" href="/host">Host console</Link>
            <Link className="rounded-lg px-3 py-2 hover:bg-secondary" href="/account">Account</Link>
          </nav>
          <div className="ml-auto">
            <WalletButton />
          </div>
        </div>
        <div className="border-t border-border bg-accent">
          <p className="mx-auto max-w-[1312px] px-4 py-1.5 text-xs text-foreground sm:px-8">
            <span className="mr-2 rounded border border-foreground px-1 font-mono text-[10px] font-semibold">TESTNET</span>
            Real transactions on {targetChain.name} (chain {targetChain.id}) with test MON. Unaudited — do not use real assets.
          </p>
        </div>
      </header>
      {!auctionHouse && (
        <p className="mx-auto mt-4 max-w-[1312px] px-4 text-sm text-warning sm:px-8">
          No AuctionHouse deployment found for chain {targetChain.id}. Deploy, then run <code>pnpm contracts:export</code>.
        </p>
      )}
      <RefundBanner />
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden">
        {[
          ["/", "Explore"],
          ["/create", "Sell"],
          ["/host", "Host"],
          ["/account", "Account"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="flex h-14 flex-1 items-center justify-center text-sm font-semibold">
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
