import { zeroAddress, type Address } from "viem";
import type { Auction } from "./useAuction";

/** What the phone should show. `ended` = clock at zero or already settled. */
export function resultFor(a: Auction, me: Address | undefined, ended: boolean): "live" | "won" | "lost" | "no-bids" {
  if (!ended) return "live";
  if (a.topBidder === zeroAddress) return "no-bids";
  return me && a.topBidder.toLowerCase() === me.toLowerCase() ? "won" : "lost";
}
