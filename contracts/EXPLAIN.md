# How the contracts work (plain English)

Two contracts. **DemoNFT** turns an item into a token. **AuctionHouse** runs the auction.
Neither has an owner or admin: nobody — including us — can move escrowed NFTs or MON
outside the rules below.

## DemoNFT

**`mint(to)`** — Anyone can create a new token for any address, for free. IDs count up from 1.
That makes the tokens worthless as proof of anything, which is fine for a testnet demo.

**`mintWithURI(to, uri)`** — Same, but also stores the item's details (name, description,
photo link, category) on-chain as a small `data:` JSON document. The photo itself lives on
Vercel Blob; only its link is on-chain. For physical items the token is a listing record —
it does not prove ownership of, or deliver, the item.

## AuctionHouse

**`createAuction(nft, tokenId, minPrice, duration)`** — The seller lists a token they own.
The contract checks the price and duration are non-zero, that the address is a real ERC-721,
that the caller owns the token and has approved the house, then records the auction and pulls
the token into escrow with `safeTransferFrom`. It re-reads `ownerOf` afterwards so a fake NFT
contract that only *pretends* to transfer is rejected. If anything fails, the whole
transaction reverts — no half-created auctions. It also stores the creation block so the
website can read bid events in small block ranges.

**`bid(id)`** — Send MON to bid. Rejected if the auction is unknown, settled or cancelled,
already past its end time, if you are the seller, or if you already hold the top bid. The
first bid must be at least the starting price; every later bid must be at least 5% higher,
rounded **up** so the 5% is never short-changed. The previous leader is **not** sent their
MON here — it is credited to `pendingReturns` for them to withdraw. That way a bidder whose
wallet rejects MON can never block other people's bids. If a bid arrives with less than 60
seconds left, the end time moves to 60 seconds after that bid (anti-sniping); it never moves
earlier.

**`minNextBid(id)`** — Read-only helper returning the smallest bid `bid` will accept right
now, using exactly the same rule. The website uses it so the UI and contract never disagree.

**`withdraw()`** — Pays out everything credited to you after being outbid. The balance is
set to zero *before* sending (checks-effects-interactions), and the function is
`nonReentrant`. If the transfer fails the whole call reverts, so your credit is restored —
a failed withdrawal never erases money.

**`endAuction(id)`** — Anyone can call it once the end time has passed. It marks the auction
`Ended` first (so it can never be settled twice, even by re-entrancy), then: with no bids,
returns the NFT to the seller; with bids, sends the NFT to the winner and the winning MON to
the seller. Settlement is all-or-nothing: if either transfer fails, the transaction reverts
and the auction stays active. Known trade-off: a seller who cannot receive MON, or a winning
contract that cannot receive NFTs, blocks settlement — the assets stay safely escrowed and
fully accounted for, but cannot be released.

**`cancelAuction(id)`** — The seller can cancel only while there are no bids. It marks the
auction `Cancelled`, then returns the NFT.

**`onERC721Received`** — Accepts NFTs only when the house itself is pulling them in during
`createAuction`. Tokens sent directly are rejected so nothing can get stuck without an auction.

## The accounting rule we test

At every moment:

```
contract balance  ≥  (top bids of Active auctions) + (all pendingReturns)
```

It is exactly equal unless someone force-sends MON (e.g. via `selfdestruct`); that extra MON
belongs to no one and cannot be withdrawn. A stateful invariant test drives thousands of random
create/bid/withdraw/settle/cancel/time-travel/force-send sequences and checks this, plus MON
conservation (every wei bid is still owed, withdrawn, or paid to a seller) and NFT custody
(escrowed tokens belong only to active auctions).
