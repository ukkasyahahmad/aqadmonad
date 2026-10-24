# Aqad Lelang: design

Date: 24 Oct 2026 (Monad Blitz Jogja). Code freeze 18:00, code changes after 17:30 only to fix breakage.

This document sits on top of two sources and only records what they don't already say, or where they disagree:

- `CLAUDE.md` (project rules, contract spec, demo journey, Monad rules). **Wins on conflicts.**
- `docs/aqadPRD.md` section 3 (full PRD: contract spec, tests, front-end spec, milestones, error states).
- `docs/aqad-1.pen` (Pencil design: all screens + design tokens). Read it with the Pencil MCP tools or as JSON.

## Intent and the why

In Indonesian Facebook/WhatsApp lelang groups, bidders comment a bid and often never pay ("bid and run"). The judges must leave believing two things: the problem is real, and Aqad removes it because **the bid is the payment**. There is nothing left to pay after winning, so there is nothing to run from.

The demo is the full loop, live, in about 2 minutes: the join QR goes on the big screen while Fahim explains bid-and-run → the audience joins on phones and gets test MON → Fahim mints the NFT on `/host` and lists it → every phone and the big screen jump to the live auction → people bid → the big screen shows the live ranking → clock ends → Settle → winner shown.

Three claims the demo must make visible:

1. **You can't bid without locking money.** Every bid is real MON held by the contract.
2. **The seller is paid.** One `settle()` sends the NFT to the winner and the winning MON to the seller.
3. **Everyone else gets everything back.** No fees; refunds happen the moment you're outbid, inside the outbidder's transaction.

## Goals

- Everything in `CLAUDE.md` "Demo journey" and "Contract", built in the PRD milestone order, live on Monad testnet at a Vercel URL with real MetaMask pop-ups on `/host`.
- The three claims above are readable on screen without Fahim having to explain them.

## Non-goals

Everything out of scope in `CLAUDE.md`/PRD: USDC, escrow, multiple lots, database, accounts, bots, mainnet, reputation.

## Anti-goals (fails even if it works)

- Any gambling vocabulary in the UI.
- Faked numbers (confirm times, block delays, stats). If a number can't be measured, don't show it.
- A demo where locking or refunding is invisible, e.g. the money moves but the screen only shows a top bid.
- Missing the 18:00 freeze because of polish. Follow the `CLAUDE.md` cut order.

## Decisions made in conversation

**Join first, then list (Fahim agreed to Claude's suggestion).** `create()` starts the clock immediately, so the audience must already be joined and funded when Fahim lists the lot. No contract change.
- The QR on the big screen points to plain `/join` (no auction id). It works before any auction exists.
- `/join` makes the burner, drips, then waits on a "Waiting for the auction to start" state.
- The "current auction" is the newest one: `nextId - 1`, or the latest `AuctionCreated` event. When it appears (or changes), joined phones go to `/a/[id]` by themselves, within about 1 s (reuse the 1 s phone poll; no extra RPC load).
- The big screen works the same way: a `/screen` route (no id) shows `Screen / Lobby` until an auction exists, then switches to Live for the newest auction. `/screen/[id]` and `/a/[id]` still work for direct links.
- On `/host`, mint can happen before the room joins. Create is the moment the clock starts.

**Lock on bid, not on join (Fahim agreed to Claude's suggestion).** No join deposit. Joining gets you a burner wallet and 1 test MON from the drip. MON is locked only when you tap Bid, and refunded in the same tx when someone outbids you. When the clock ends, only the winner's MON is still in the contract. The contract stays exactly as specified in `CLAUDE.md`.

To make locking visible without a deposit step:
- `/join` copy states it, e.g. "When you bid, your MON is locked in the contract until someone outbids you." (The design's `Screen / Lobby` already has "Tap Bid. Your MON is locked in the contract." / "Outbid? Your MON comes back in the same transaction.")
- `/screen/[id]` Live shows a live **"MON locked in the contract"** figure (= current `topBid`, since only the top bid is held).

**Leaderboard = the design's bid feed, ranked by person (Fahim agreed to Claude's suggestion).** This settles the `CLAUDE.md` ("ranked top-bidders leaderboard") vs PRD ("bid feed") difference:
- Built from `BidPlaced` events. Bids strictly increase, so newest-first is also highest-first.
- One row per bidder at their highest bid (merge repeat bidders), ordered by that bid, descending.
- Row 1 is tagged **locked**; every other row is tagged **refunded**.
- Each row keeps the design's detail lines: the refund line from that bidder's latest bid ("0.14 MON refunded to Bakpia-07 in the same tx"), block number, tx link. "On screen in X s" only if measured truthfully (see PRD "Confirm time on the big screen").
- Keep the header count ("14 bids · 12 refunds"), the "+10 s" flash on `Extended`, and the small join QR.
- Update the `CLAUDE.md` `/screen/[id]` line to describe this once built.

**The Pencil file is a guide, not a spec (Fahim's call).** Match its layout, copy and tokens where it's cheap. Simplify where it saves time. Screens in the file: `Phone / Join`, `Phone / Bid — top bid | outbid | someone got there first`, `Phone / Result — won | lost`, `Screen / Lobby | Live | Sold`, `Host / Console`.

## Constraints

All of `CLAUDE.md` "Monad rules" and "Rules" apply: explicit gas limits, reserve-balance waits (1.5 s after the drip and after each receipt), countdown from block timestamp, `fallback()` RPCs, 1 multicall/s on phones, wss with 500 ms `getLogs` fallback on the screen, no keys in logs or git, commit and stop for a 5-line report at each milestone.

**Already settled by the sources:**
- Funder wallet holds about 80 MON (PRD section 1), enough for 60 drips of 1 MON while staying above the 10 MON reserve. Keep the 1 MON drip and `DRIP_CAP` 60.
- Execution stops at each milestone for Fahim's "go" (`CLAUDE.md` Rules). Steps that need Fahim: filling `contracts/.env`, linking the GitHub repo in Vercel and setting `FUNDER_PRIVATE_KEY` there (milestone 1), and approving MetaMask pop-ups. The plan should ask for these at the start of the milestone that needs them.

## Left to the builder (Claude's calls, flagged for Fahim)

- **Design tokens come from `docs/aqad-1.pen` `variables`.** `DESIGN.md` is referenced by `CLAUDE.md` but isn't in the repo. The tokens are: bg `#FAFAF9`, surface `#FFFFFF`, surface-2 `#F5F5F4`, border `#E7E5E4`, text `#1C1917` / `#57534E` / `#A8A29E`, accent `#4F35C9`, accent-soft `#EEEBFB`, accent-ink `#3A26A0`, amber-soft `#FEF3C7`, amber-ink `#92400E` (outbid state; no red), stage (big-screen dark) `#0C0A09` / `#1C1917`, line `#292524`, stage text `#FAFAF9` / `#A8A29E`, fonts Geist + Geist Mono, control height 52 px. If Fahim drops in `DESIGN.md` later, it wins.
- **Lot #1 is "Batik Kawung, hand-drawn"**, image `docs/aqad-1-assets/generated.png`, copied to `web/public/lot/1.png` with `web/public/lot/1.json` metadata. This is the design's placeholder and can be swapped for Fahim's real image without code changes.
- **First simplifications if behind**, before the `CLAUDE.md` cut order: phone result stats (Your bids / Refunded / Gas paid) → Sold stats except bids and refunds → the Host console's right-hand live panel (link to `/screen/[id]` instead).
- **"MON locked" on the Sold screen** shows the peak `topBid` (the design calls it "peak locked"). Same value as the final price in practice; keep or drop freely.
- Everything else not covered here, `CLAUDE.md` or the PRD: builder's judgment, preferring less code.
