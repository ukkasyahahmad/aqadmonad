import { LatestBlock } from "@/components/latest-block";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Monad Testnet</p>
        <h1 className="text-4xl font-semibold tracking-tight">Aqad Lelang</h1>
        <p className="text-muted-foreground">
          Real-time NFT auction. Losing bids are refunded in full.
        </p>
      </header>
      <section className="rounded-xl border bg-card p-6">
        <LatestBlock />
      </section>
      <p className="text-xs text-muted-foreground">Unaudited. Testnet only. Do not use with real assets.</p>
    </main>
  );
}
