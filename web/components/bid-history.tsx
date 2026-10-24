import { User } from "lucide-react";
import { formatMon, shortAddr } from "@/lib/format";
import type { BidEvent } from "@/hooks/use-bid-history";
import { Card, TxLink } from "./kit";

export function BidHistory({ bids, loading, syncing }: { bids: BidEvent[]; loading: boolean; syncing: boolean }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Bid history</h2>
        <span className="text-xs text-muted-foreground">from on-chain BidPlaced events</span>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Reading events…</p>
      ) : bids.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No bids yet.{syncing && " Still scanning blocks…"}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {bids.map((b, i) => (
            <li key={`${b.txHash}-${b.logIndex}`} className="flex items-center gap-3 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-secondary">
                <User className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{shortAddr(b.bidder)}</p>
                <p className="text-xs text-muted-foreground">
                  Block {b.blockNumber.toString()} · <TxLink hash={b.txHash} label="tx" />
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold">{formatMon(b.amount)} MON</p>
                <p className={`text-xs ${i === 0 ? "font-semibold text-success" : "text-muted-foreground"}`}>
                  {i === 0 ? "Latest" : "Outbid"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {syncing && bids.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Still scanning older blocks…</p>}
    </Card>
  );
}
