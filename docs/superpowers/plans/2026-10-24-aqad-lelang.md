# Aqad Lelang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live NFT auction on Monad testnet where every bid locks real MON, the outbid bidder is refunded in the same tx, and one `settle()` pays the seller and hands the NFT to the winner, demoed from a Vercel URL with phones, a big screen and a MetaMask host console.

**Architecture:** One small Solidity auction contract plus an OpenZeppelin ERC-721, both deployed with Foundry. A Next.js app holds four surfaces: `/host` (MetaMask via wagmi), `/join` and `/a/[id]` (in-page burner wallets), and `/screen` (event-driven big screen), plus one serverless `/api/drip` route. No database and no indexer: phones poll one multicall per second, and the screen uses `watchContractEvent` over wss with `getLogs` polling as the fallback.

**Tech Stack:** Solidity ^0.8.24, Foundry ≥ 1.8, OpenZeppelin Contracts, Next.js App Router + TypeScript + Tailwind + shadcn/ui, wagmi + viem (≥ 2.40 for sync sends if available), vitest for pure web logic, `qrcode.react` for QR codes, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-24-aqad-lelang-design.md`, built on `CLAUDE.md` (wins on conflicts) and `docs/aqadPRD.md` §3. Design reference: `docs/aqad-1.pen` (JSON; screens named `Phone / …`, `Screen / …`, `Host / Console`; tokens under `variables`).

## Global Constraints

- Chain: Monad testnet, chain id **10143**. RPCs: `NEXT_PUBLIC_RPC_URL` first if set, then `https://testnet-rpc.monad.xyz`, `https://rpc-testnet.monadinfra.com`, `https://rpc.ankr.com/monad_testnet`, wrapped in viem/wagmi `fallback()`. WSS: `wss://testnet-rpc.monad.xyz`.
- Explorer links: `https://testnet.monadvision.com/tx/<hash>` (and `/address/<addr>`).
- Gas is charged on the limit: every `bid`, `create`, `settle` tx passes an explicit `gas` from `GAS` in `web/lib/contracts.ts` (measured +20%). Drip uses `gas: 21_000n`.
- Reserve balance: Bid stays disabled 1.5 s after the drip receipt and 1.5 s after each bid receipt.
- Countdown = `endsAt` minus the latest block timestamp, then ticks locally. Never `Date.now()` against `endsAt` directly.
- Phones: one multicall per second, no more.
- Auction defaults on `/host`: reserve 0.05 MON, step 0.01 MON, duration 60 s, buffer 10 s.
- Copy: never "win big", "jackpot", "lucky" or any gambling word. Required strings: "Bid {minNextBid} MON", "Outbid, {x} MON is back in your wallet", "Someone got there first. Tap again for {min}", "You won", "All your MON is back", "Getting you 1 test MON…", "When you bid, your MON is locked in the contract until someone outbids you."
- Never show a measured number you didn't measure. The phone shows its own send-to-receipt time. The screen shows the block number and, if measured, block-to-screen delay.
- Tokens from `docs/aqad-1.pen` `variables` (listed in the spec): Geist / Geist Mono, stone greys, accent `#4F35C9`, amber for the outbid state, **no red**, 52 px controls; big screen uses the dark `stage` palette.
- Secrets: `DEPLOYER_PRIVATE_KEY` (contracts/.env), `FUNDER_PRIVATE_KEY` (Vercel env + web/.env.local), never logged, printed or committed. `.gitignore` already covers `.env` and `.env.*`.
- Milestones: after each milestone (marked **[M#]**), commit, stop, report in 5 lines what works and how to test it, and wait for Fahim's "go". `cd web && npm run build` must pass before every push.
- Cut order if late: phone result stats → Sold stats except bids/refunds → host live panel → `cancel()` → nicknames → MetaMask-on-phone. Never cut money-backed bids, same-tx refunds, the 10 s extension, one-tx settle, `withdraw()`, MetaMask pop-ups on `/host`.

## Review Focus

1. **Two phones tap Bid in the same block.** One reverts with `BidTooLow`. That phone must show "Someone got there first. Tap again for {new min}", spend no MON, and re-enable Bid after the refresh. → test in Task 7 (`bidError` mapping).
2. **The big screen reloads or opens mid-auction.** It must backfill every earlier `BidPlaced` (chunked `getLogs`), and live + polled events must not create duplicate rows. → tests in Task 8 (`rankBidders` dedupes by `txHash:logIndex`) and Task 4 (`logRanges` chunks).
3. **Several phones hit `/api/drip` at once.** Funder sends must not collide on nonce, the same address must never get a second drip, and an address that already holds ≥ 0.5 MON gets `{ ok: true, skipped: true }` so the phone proceeds. → tests in Task 5 (`dripDecision`).
4. **The auction ends with no bids.** Screen Sold, phone result and host settle must handle `topBidder == 0x0` ("No bids. The NFT went back to the seller."), not crash or say "You won". → contract test 7 (Task 2), `resultFor` test in Task 9.
5. **The phone's own clock is wrong, or the tab sleeps.** The countdown must come from block time and resync each poll. → `secondsLeft` test in Task 4.

---

## File map

```
contracts/
  src/LotNFT.sol            OZ ERC721 + URIStorage + Ownable, safeMint(to, uri)
  src/AqadLelang.sol        the auction
  test/AqadLelang.t.sol     8 required tests (+ cancel, withdraw edge)
  script/Deploy.s.sol       deploys both, LotNFT owned by HOST_ADDRESS
  EXPLAIN.md                one paragraph per function (Task 12)
web/
  lib/chain.ts              monadTestnet chain, http + ws transports, publicClient, wagmi config
  lib/contracts.ts          addresses, ABIs, GAS limits, EXPLORER helpers
  lib/nickname.ts           nickname(address)
  lib/time.ts               secondsLeft(...), formatClock(s)
  lib/logs.ts               logRanges(from, to, chunk)
  lib/burner.ts             getBurner(): { account, walletClient } from localStorage
  lib/bids.ts               rankBidders(logs), bidError(err)
  lib/result.ts             resultFor(auction, me)
  lib/useAuction.ts         1 s multicall hook: auction, minNext, balance, blockTs
  lib/useLatestAuction.ts   1 s poll of lastId → current auction id
  lib/useBidFeed.ts         screen: backfill + watch + poll fallback → logs
  lib/drip.ts               dripDecision(...)
  app/api/drip/route.ts
  app/join/page.tsx
  app/a/[id]/page.tsx
  app/screen/page.tsx       lobby → redirects to newest auction
  app/screen/[id]/page.tsx  live + sold
  app/host/page.tsx
  public/lot/1.png, public/lot/1.json
  lib/*.test.ts             vitest tests for the pure modules
```

---

### Task 0: Prerequisites (Fahim, before Task 1)

Found missing on this machine at plan time: Foundry (`forge`) and the monskills plugin. Not checked: the OpenZeppelin MCP.

- [ ] **Step 1:** Ask Fahim to run `curl -L https://foundry.paradigm.xyz | bash && foundryup`, then confirm with `forge --version` (expect ≥ 1.8).
- [ ] **Step 2:** Ask Fahim to install monskills (`/plugin marketplace add therealharpaljadeja/monskills`, `/plugin install monskills@monskills`) and the OpenZeppelin MCP (`claude mcp add -t http OpenZeppelinSolidityContracts https://mcp.openzeppelin.com/contracts/solidity/mcp`). If either can't be installed, continue: scaffold by hand per this plan, write `LotNFT.sol` from the OZ Wizard shape described in Task 2.
- [ ] **Step 3:** Ask Fahim to have ready: `DEPLOYER_PRIVATE_KEY` (a few MON), `FUNDER_PRIVATE_KEY` (~80 MON), his MetaMask host address. He types keys into `.env` files himself; never ask for them in chat.

### Task 1: Scaffold + live block number on Vercel **[M1]**

**Files:**
- Create: `contracts/` (Foundry project), `web/` (Next.js), `.monskills`, `web/lib/chain.ts`, `web/app/page.tsx`, `web/.env.example`, `contracts/.env.example`
- Modify: `.gitignore` (add `contracts/out`, `contracts/cache`, `contracts/broadcast`, `web/.next`, `web/.vercel`)

**Interfaces:**
- Produces: `monadTestnet` (viem `Chain`, id 10143), `httpTransport` (fallback of the RPCs in Global Constraints), `wsUrl`, `publicClient` (viem, http fallback, `pollingInterval: 200`), `wagmiConfig` (chains `[monadTestnet]`, connectors `[injected()]`, transport `httpTransport`), `<Providers>` client component wrapping wagmi + react-query, in `web/app/providers.tsx`.

- [ ] **Step 1:** Read monskills `monskill`, then `scaffold`, `gas`, `concepts` (reserve balance, async execution), `addresses`. Follow `scaffold` for layout and the tsconfig ES2020 fix, with the `CLAUDE.md` overrides (no Para, no Alchemy wallet, no indexer).
- [ ] **Step 2:** `forge init --no-git contracts`, delete the Counter files, `cd contracts && forge install --no-git OpenZeppelin/openzeppelin-contracts`, add the remapping `@openzeppelin/=lib/openzeppelin-contracts/`, and set `solc = "0.8.24"` in `foundry.toml`.
- [ ] **Step 3:** `npx create-next-app@latest web --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*"`, then `npx shadcn@latest init`, then `npm i wagmi viem @tanstack/react-query qrcode.react geist` and `npm i -D vitest`. Add `"test": "vitest run"` to the scripts. Record the installed viem version; Task 7 needs it.
- [ ] **Step 4:** Write `.monskills` with `built-with=monskills` and `chain=monad-testnet`. Write `.env.example` files listing the names only: `DEPLOYER_PRIVATE_KEY`, `HOST_ADDRESS` (contracts) and `FUNDER_PRIVATE_KEY`, `DRIP_CAP`, `NEXT_PUBLIC_RPC_URL` (web).
- [ ] **Step 5:** Put the design tokens in `web/app/globals.css` as CSS variables mapped into Tailwind (names = the `.pen` variable names), and set Geist / Geist Mono in `layout.tsx`.
- [ ] **Step 6:** Write `web/lib/chain.ts` and `app/providers.tsx` per the Interfaces block. `app/page.tsx` is a client page that shows "Monad testnet · block {n}", refreshed every second via `publicClient.getBlockNumber()`, with links to `/join`, `/screen`, `/host`.
- [ ] **Step 7:** Run `cd web && npm run build`. Expected: build succeeds.
- [ ] **Step 8:** Commit ("scaffold: foundry + next, live block number") and push. Ask Fahim to import the repo in Vercel with root directory `web`, and to add `FUNDER_PRIVATE_KEY` and `DRIP_CAP=60` there. Open the Vercel URL and check that the block number moves. Save the URL; Task 3 needs it.
- [ ] **Step 9:** 5-line milestone report, then wait for "go".

### Task 2: Contracts + tests + gas report **[M2a]**

**Files:**
- Create: `contracts/src/LotNFT.sol`, `contracts/src/AqadLelang.sol`, `contracts/test/AqadLelang.t.sol`

**Interfaces:**
- Produces (ABI used by web):
  - `LotNFT`: `constructor(address initialOwner)`, `safeMint(address to, string uri) onlyOwner returns (uint256 tokenId)` (ids start at **1**), plus standard `approve`, `ownerOf`, `tokenURI`, `Transfer` event.
  - `AqadLelang`:
    - `struct Auction { address seller; address nft; uint256 tokenId; uint128 reserve; uint128 minStep; uint64 endsAt; uint32 buffer; address topBidder; uint128 topBid; bool settled; }`
    - `auctions(uint256) view` (public mapping getter, same field order), `owed(address) view`, `lastId() view`. **Deviation from the PRD's `nextId`:** `create` does `id = ++lastId`, so ids start at 1 and `lastId` is the newest auction (0 = none). The web uses this to find the current auction.
    - `create(address nft, uint256 tokenId, uint128 reserve, uint128 minStep, uint64 duration, uint32 buffer) returns (uint256 id)`
    - `bid(uint256 id) payable`, `settle(uint256 id)`, `withdraw()`, `cancel(uint256 id)`, `minNextBid(uint256 id) view returns (uint256)`
    - Events: `AuctionCreated(uint256 indexed id, address indexed seller, address nft, uint256 tokenId, uint128 reserve, uint128 minStep, uint64 endsAt)`, `BidPlaced(uint256 indexed id, address indexed bidder, uint256 amount, uint64 endsAt, address indexed prevBidder, uint256 refunded)`, `Extended(uint256 indexed id, uint64 endsAt)`, `Settled(uint256 indexed id, address indexed winner, uint256 amount)`, `Cancelled(uint256 indexed id)`
    - Errors: `AuctionEnded()`, `BidTooLow(uint256 minNext)`, `NotEnded()`, `AlreadySettled()`, `NotSeller()`, `HasBids()`, `NothingOwed()`, `WithdrawFailed()`

- [ ] **Step 1: Write `LotNFT.sol`** with the OZ MCP `solidity-erc721` (Ownable, mintable, URI storage), then adjust so `_nextTokenId` starts at 1 and `safeMint` returns the id.
- [ ] **Step 2: Write the failing tests** in `AqadLelang.t.sol`. Setup: deploy both, mint token 1 to `seller`, seller approves and calls `create(nft, 1, 0.05 ether, 0.01 ether, 60, 10)`, `alice`/`bob` get 10 ether each via `vm.deal`. Tests, with these exact assertions:
  1. `test_Reserve`: `bid{value: 0.04 ether}` reverts `BidTooLow(0.05 ether)`; `bid{value: 0.05 ether}` succeeds; `topBid == 0.05 ether`.
  2. `test_OutbidRefundsSameTx`: alice bids 0.05, bob bids 0.06; alice's balance is back to 10 ether; contract balance == 0.06 ether; `BidPlaced` emitted with `prevBidder == alice`, `refunded == 0.05 ether` (`vm.expectEmit`).
  3. `test_MinStep`: after alice bids 0.05, bob's 0.055 reverts `BidTooLow(0.06 ether)`.
  4. `test_AntiSnipeExtends`: `vm.warp(endsAt - 5)`, bid; `endsAt == block.timestamp + 10`; `Extended` emitted. Also: a bid at `endsAt - 30` leaves `endsAt` unchanged.
  5. `test_BidAfterEndReverts`: `vm.warp(endsAt)`; bid reverts `AuctionEnded()`.
  6. `test_SettleOnce`: alice bids 0.05, warp to end, anyone settles; `ownerOf(1) == alice`; seller balance +0.05 ether; second `settle` reverts `AlreadySettled()`. Settling before `endsAt` reverts `NotEnded()`.
  7. `test_SettleNoBids`: warp, settle; `ownerOf(1) == seller`; `Settled(id, address(0), 0)`.
  8. `test_RejectingBidderGetsOwed`: a `Rejecter` contract (receive reverts, has `bid(id)` and `withdraw()` passthroughs, plus a toggle to start accepting) bids 0.05; bob bids 0.06 and succeeds; `owed(rejecter) == 0.05 ether`; rejecter toggles accept and calls `withdraw`; `owed == 0` and it received 0.05.
  9. `test_Cancel`: non-seller reverts `NotSeller()`; after a bid, seller reverts `HasBids()`; with no bids, seller cancels and gets the NFT back; a later bid reverts `AuctionEnded()`.
- [ ] **Step 3:** Run `cd contracts && forge test -vv`. Expected: compile failure (contract missing).
- [ ] **Step 4: Implement `AqadLelang.sol`** exactly per `CLAUDE.md` "Contract" and PRD §3 `bid` steps 1–7. Inherit `ReentrancyGuard`. NatSpec on every function. Comments explain the why: state before money, why `gas: 30_000`, why `transferFrom` and not `safeTransferFrom`, why `owed` exists. Seller payout in `settle` uses the same push-with-fallback-to-`owed` pattern. `cancel` marks the auction settled and returns the NFT.
- [ ] **Step 5:** Run `forge test -vv`. Expected: all 9 tests pass.
- [ ] **Step 6:** Run `forge test --gas-report`. Record the max gas for `bid` (first bid and outbid), `create` and `settle` in the commit message; Task 3 needs them for `GAS`.
- [ ] **Step 7:** Commit ("contracts: AqadLelang + LotNFT, 9 tests").

### Task 3: Deploy, verify, mint, reserve-balance check **[M2b]**

**Files:**
- Create: `contracts/script/Deploy.s.sol`, `web/lib/contracts.ts`, `web/public/lot/1.png` (copy of `docs/aqad-1-assets/generated.png`), `web/public/lot/1.json`
- Modify: `README.md` (create: one paragraph on what it is, addresses, explorer links, how to run)

**Interfaces:**
- Consumes: Task 2 ABI.
- Produces in `web/lib/contracts.ts`: `AUCTION_ADDRESS`, `NFT_ADDRESS` (`0x…` consts), `auctionAbi`, `nftAbi` (`as const`, copied from `contracts/out`), `GAS = { bid, create, settle, approve, mint }` (bigint, measured +20%; approve and mint from `cast estimate` +20%), `txUrl(hash)`, `addressUrl(addr)`.

- [ ] **Step 1:** Write `Deploy.s.sol`: read `DEPLOYER_PRIVATE_KEY` and `HOST_ADDRESS` from env, deploy `LotNFT(HOST_ADDRESS)` and `AqadLelang`, and log both addresses.
- [ ] **Step 2:** Ask Fahim to fill `contracts/.env`. Then run `cd contracts && source .env && forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast`. Expected: two addresses, txs on MonadVision.
- [ ] **Step 3:** Verify both contracts with the monskills verification API (see the `addresses`/`tooling-and-infra` skill). Expected: verified source on the explorer.
- [ ] **Step 4:** Write `public/lot/1.json` (`name: "Batik Kawung, hand-drawn"`, `description`, `image: "<vercel-url>/lot/1.png"`) and `web/lib/contracts.ts`.
- [ ] **Step 5: Reserve-balance check with `cast`.** Make a fresh key with `cast wallet new`, keep it in a shell variable and don't echo it. Send it 1 MON from the deployer with `--gas-limit 21000`. Immediately after the receipt, send a 0-value tx with the fresh key and note whether it's rejected. Wait 1.5 s and retry. Expected: the retry succeeds, confirming the 1.5 s waits. Report what was observed truthfully.
- [ ] **Step 6:** Write the README and commit ("deploy: testnet addresses, verified"). `npm run build` passes, then push. 5-line report, wait for "go".

### Task 4: Pure web helpers

**Files:**
- Create: `web/lib/nickname.ts`, `web/lib/time.ts`, `web/lib/logs.ts`, `web/lib/burner.ts`
- Test: `web/lib/helpers.test.ts`

**Interfaces:**
- Produces:
  - `nickname(address: `0x${string}`): string`, e.g. `"Gudeg-42"`. Word list (Jogja food/places): Gudeg, Bakpia, Malioboro, Soto, Tugu, Sate, Wedang, Kraton, Angkringan, Prambanan, Klepon, Mangut, Bakmi, Kopi, Gethuk, Tempe. Word = `parseInt(addr.slice(2, 6), 16) % 16`; digits = `parseInt(addr.slice(-2), 16) % 100`, zero-padded to 2.
  - `secondsLeft(endsAt: number, blockTs: number, fetchedAtMs: number, nowMs: number): number`: `max(0, endsAt - blockTs - (nowMs - fetchedAtMs)/1000)`.
  - `formatClock(s: number): string`: `"0:09"`, `"1:00"` (ceil seconds).
  - `logRanges(from: bigint, to: bigint, chunk = 100n): Array<[bigint, bigint]>`: inclusive, contiguous, covering `[from, to]`.
  - `getBurner(): { address, account, walletClient }`: key in `localStorage["aqad.burner"]`, created with `generatePrivateKey()` on first call, reused after; `walletClient` from `createWalletClient({ account, chain: monadTestnet, transport: httpTransport })`. Client-only.

- [ ] **Step 1: Write failing tests:**
  - `nickname` is the same for the same address, matches `/^[A-Z][a-z]+-\d{2}$/`, and differs for two fixed sample addresses (pick two that differ in chars 2–5).
  - `secondsLeft(1000, 990, 0, 4000) === 6`; `secondsLeft(1000, 990, 0, 20000) === 0`; **a wrong local clock doesn't matter**: `secondsLeft(1000, 990, 5e12, 5e12 + 1000) === 9`.
  - `formatClock(9.2) === "0:10"`, `formatClock(60) === "1:00"`, `formatClock(0) === "0:00"`.
  - `logRanges(0n, 250n)` deep-equals `[[0n,99n],[100n,199n],[200n,250n]]`; `logRanges(5n, 5n)` equals `[[5n,5n]]`.
- [ ] **Step 2:** Run `cd web && npm test`. Expected: FAIL, modules missing.
- [ ] **Step 3:** Implement the four modules.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit ("web: nickname, clock, log ranges, burner").

### Task 5: `/api/drip`

**Files:**
- Create: `web/lib/drip.ts`, `web/app/api/drip/route.ts`
- Test: `web/lib/drip.test.ts`

**Interfaces:**
- Produces:
  - `dripDecision(s: { address: string; balanceWei: bigint; dripped: Set<string>; count: number; cap: number; ipHits: number }): "send" | "skip-funded" | "already" | "cap" | "rate" | "bad-address"`. Order of checks: bad address → `already` (address lowercased in the set) → `skip-funded` (balance ≥ 0.5 MON) → `cap` (count ≥ cap) → `rate` (ipHits > 5 per minute) → `send`.
  - `POST /api/drip` with body `{ address }` → `200 { ok: true, hash }` | `200 { ok: true, skipped: true }` (for `already` and `skip-funded`) | `429 { ok: false, reason: "cap" | "rate" }` | `400 { ok: false, reason: "bad-address" }`. Sends `parseEther("1")` with `gas: 21_000n` from `privateKeyToAccount(process.env.FUNDER_PRIVATE_KEY)`. `DRIP_CAP` defaults to 60. `export const runtime = "nodejs"`.

- [ ] **Step 1: Write failing tests** for `dripDecision`: a fresh address with 0 balance → `send`; the same address after it's added to `dripped` (mixed case) → `already`; balance `parseEther("0.5")` → `skip-funded`; `count: 60, cap: 60` → `cap`; `ipHits: 6` → `rate`; `"0x123"` → `bad-address`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `dripDecision`, then the route. Module-level `dripped` set, count and IP map. **Serialize sends** with a module-level promise chain (`queue = queue.then(send)`) so concurrent requests can't reuse a nonce. Add the address to `dripped` *before* awaiting the send, and remove it if the send throws. Wait for the receipt (200 ms polling) before responding, so the phone's 1.5 s wait starts from inclusion. Never log the key or the env.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Then run `npm run dev` and `curl -XPOST localhost:3000/api/drip -d '{"address":"<fresh addr>"}'`. Expected: `{ ok: true, hash }`, and a second identical call returns `skipped: true`.
- [ ] **Step 5:** Commit ("web: /api/drip").

### Task 6: `/join` + follow the newest auction

**Files:**
- Create: `web/lib/useLatestAuction.ts`, `web/app/join/page.tsx`

**Interfaces:**
- Consumes: `getBurner`, `nickname`, `publicClient`, `AUCTION_ADDRESS`, `auctionAbi`.
- Produces: `useLatestAuction(): bigint | undefined`, which reads `lastId` every 1 s and returns `undefined` while it's 0.

- [ ] **Step 1:** Build `/join` from `Phone / Join`: lot image + "LOT #1" tag, title, "Reserve 0.05 MON · steps of 0.01 MON" (reserve and step come from the auction if one exists, otherwise these defaults), identity card ("You're bidding as {nickname}", short address), and a drip row.
- [ ] **Step 2:** On mount: call `getBurner()`, then `POST /api/drip`. Drip row states: "Getting you 1 test MON…" → "{balance} MON ready" (after the receipt plus 1.5 s) → on 429 "The test-MON tap is empty. Ask the host." Add the copy line "When you bid, your MON is locked in the contract until someone outbids you."
- [ ] **Step 3:** Button: disabled until funded. While `useLatestAuction()` is `undefined`, it reads "Waiting for the auction to start". Once an id exists and the phone is funded, `router.replace('/a/' + id)` happens automatically; the button is the manual fallback. Skip "Use MetaMask instead" for now (cut-order item; add only if time is left after Task 11).
- [ ] **Step 4:** Manual check on a phone or a narrow browser at the dev URL: the drip lands, the button waits, and calling `create` (with `cast`, or later from `/host`) redirects within about 1 s. Reloading keeps the same nickname.
- [ ] **Step 5:** Commit ("web: /join with burner, drip, auto-follow").

### Task 7: `/a/[id]` bid flow **[M3]**

**Files:**
- Create: `web/lib/useAuction.ts`, `web/lib/bids.ts` (the `bidError` part), `web/app/a/[id]/page.tsx`
- Test: `web/lib/bids.test.ts`

**Interfaces:**
- Consumes: `getBurner`, `secondsLeft`, `formatClock`, `nickname`, `GAS.bid`, `txUrl`.
- Produces:
  - `useAuction(id: bigint, me?: Address): { auction?: Auction; minNext?: bigint; balance?: bigint; blockTs?: number; fetchedAt?: number; refresh(): void }`: one `publicClient.multicall` per second with `auctions(id)`, `minNextBid(id)`, `getEthBalance(me)` (multicall3), and `getCurrentBlockTimestamp()` (multicall3). Shared by the phone, the screen and the host.
  - `type Auction = { seller, nft, tokenId, reserve, minStep, endsAt: number, buffer, topBidder, topBid, settled }`.
  - `bidError(err: unknown): { kind: "too-low"; minNext: bigint } | { kind: "ended" } | { kind: "funds" } | { kind: "busy" } | { kind: "other"; message: string }`. Use viem `BaseError.walk` to find the `ContractFunctionRevertedError` and decode `BidTooLow(minNext)` / `AuctionEnded`. Insufficient funds → `funds`. HTTP 429 or a timeout → `busy`.

- [ ] **Step 1: Write failing tests** for `bidError`. Build the errors with viem's `ContractFunctionRevertedError` / `ContractFunctionExecutionError` around encoded `BidTooLow(0.15 ether)` revert data; expect `{ kind: "too-low", minNext: 150000000000000000n }`. `AuctionEnded` data → `{ kind: "ended" }`. A plain `Error("boom")` → `{ kind: "other", message: "boom" }`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `bidError` and `useAuction`.
- [ ] **Step 4:** Build the page from `Phone / Bid — *`: header (thumb, lot, nickname, balance), clock (`formatClock(secondsLeft(...))` re-rendered every 200 ms, plus a progress bar), top bid card (amount, "by {nickname}"), status chip, the big "Bid {minNext} MON" button (64 px), confirm line, explorer link.
  - **Send:** if the installed viem (Task 1) exports `writeContractSync`, use it; otherwise use `writeContract` + `waitForTransactionReceipt({ pollingInterval: 200 })`. Always pass `gas: GAS.bid` and `value: minNext`. Measure `performance.now()` from send to receipt and show "Your last bid confirmed in {x} s".
  - **Debounce:** disabled while sending and for 1.5 s after each receipt; disabled if `balance < minNext + gasCost`, labelled "Not enough MON".
  - **Chip states:** top bidder is me → "You're the top bid" (accent). I was top on the previous poll and now I'm not → amber "Outbid, {my previous bid} MON is back in your wallet", plus one `getLogs` for `BidPlaced` with `prevBidder = me` and `id` to link "View refund tx". A bid landed in the last `buffer` seconds and moved `endsAt` → grey "Clock extended to {clock}".
  - **On `too-low`:** "Someone got there first. Tap again for {minNext}", with "No MON was spent on that try" and an immediate `refresh()`. On `busy`: "Network busy, retrying" with backoff. On `ended`: refresh.
- [ ] **Step 5:** Manual check with two browsers (two burners) on one auction created via `cast` or a temporary script: outbid each other and confirm the refund chip shows on the outbid one; tap both at once to see the "Someone got there first" path.
- [ ] **Step 6:** `npm run build`, commit ("web: bid page"), push. 5-line report, wait for "go".

### Task 8: Big screen live **[M4]**

**Files:**
- Create: `web/lib/useBidFeed.ts`, `web/app/screen/[id]/page.tsx`
- Modify: `web/lib/bids.ts` (add `rankBidders`)
- Test: `web/lib/bids.test.ts`

**Interfaces:**
- Consumes: `useAuction`, `logRanges`, `nickname`, `secondsLeft`, `formatClock`, `txUrl`.
- Produces:
  - `type BidLog = { bidder: Address; amount: bigint; endsAt: number; prevBidder: Address; refunded: bigint; txHash: Hex; logIndex: number; blockNumber: bigint }`
  - `rankBidders(logs: BidLog[]): { rows: Array<{ bidder; amount; refunded; prevBidder; txHash; blockNumber; status: "locked" | "refunded" }>; bids: number; refunds: number; locked: bigint }`. Dedupe by `` `${txHash}:${logIndex}` `` first. One row per bidder at their highest bid (that bid's refund/tx/block fields), sorted by amount descending. Row 0 is `locked`, the rest `refunded`. `bids` = unique logs, `refunds` = logs with `refunded > 0`, `locked` = row 0 amount (or 0).
  - `useBidFeed(id: bigint): { logs: BidLog[]; extendedAt?: number; settledTx?: Hex; lastSeenMs: number }`. Backfill: scan back from head in `logRanges` chunks until the `AuctionCreated` for `id` is found, collecting `BidPlaced`/`Extended`/`Settled`. Live: `watchContractEvent` on a `webSocket(wsUrl)` client. If the socket errors or no block is seen for 3 s, poll `getLogs` every 500 ms from the last seen block. Merge everything through the same dedupe.

- [ ] **Step 1: Write failing tests** for `rankBidders`, with fixtures: A 0.05 → B 0.06 (refunded A 0.05) → A 0.07 (refunded B 0.06), plus the A 0.07 log duplicated. Expect `rows.map(r => [r.bidder, r.amount, r.status])` = `[[A, 0.07, "locked"], [B, 0.06, "refunded"]]`, `bids === 3`, `refunds === 2`, `locked === 0.07 ether`. Empty input → `rows: [], bids: 0, refunds: 0, locked: 0n`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `rankBidders` and `useBidFeed`.
- [ ] **Step 4:** Build `/screen/[id]` from `Screen / Live` (16:9, `stage` palette):
  - Top bar: brand, LIVE pill, "Monad testnet · block {n}".
  - Main: lot, countdown ≥ 20vh in Geist Mono, top bid + nickname, and **"{locked} MON locked in the contract"**.
  - Right side: the "Bids" ranking with header "{bids} bids · {refunds} refunds". Each row shows nickname, amount, a `locked`/`refunded` tag, "{refunded} MON refunded to {nickname(prevBidder)} in the same tx" when `refunded > 0`, block number, and a tx link.
  - Bottom: a small `qrcode.react` QR to `{origin}/join` with "Scan to bid from your phone".
  - A "+10 s / late bid, clock extended" flash for 2 s whenever an `Extended` arrives.
  - Show "on screen in {x} s" only if you can measure it truthfully (block timestamp → `Date.now()` has 1 s granularity, so prefer leaving it out).
- [ ] **Step 5:** Manual check: run the Task 7 two-browser bidding with the screen open; rows update within about 1 s; reload the screen mid-auction and the rows come back without duplicates; kill the wss (DevTools offline toggle for ws, or point `wsUrl` at a bad host) and polling keeps the feed live.
- [ ] **Step 6:** `npm run build`, commit ("web: big screen live"), push. 5-line report, wait for "go".

### Task 9: Lobby, Sold and phone results

**Files:**
- Create: `web/lib/result.ts`, `web/app/screen/page.tsx`
- Modify: `web/app/screen/[id]/page.tsx` (Sold view), `web/app/a/[id]/page.tsx` (result view)
- Test: `web/lib/result.test.ts`

**Interfaces:**
- Consumes: `useLatestAuction`, `useAuction`, `useBidFeed`, `rankBidders`.
- Produces: `resultFor(a: Auction, me: Address, ended: boolean): "live" | "won" | "lost" | "no-bids"`, where `ended` means `secondsLeft === 0 || a.settled`.

- [ ] **Step 1: Write failing tests:** not ended → `live`; ended with `topBidder == me` (case-insensitive) → `won`; ended with another top bidder → `lost`; ended with `topBidder == zeroAddress` → `no-bids`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `resultFor`.
- [ ] **Step 4:** `/screen` (no id) = `Screen / Lobby`: "STARTING SOON", a big QR to `{origin}/join` with the URL text, the three steps copied from the design, and the lot with "reserve 0.05 MON". When `useLatestAuction()` returns an id whose auction hasn't ended, `router.replace('/screen/' + id)`. If the newest auction has already ended, stay on the lobby (that's the rehearsal reset).
- [ ] **Step 5:** Sold view on `/screen/[id]`, shown when ended. Before settle: "Waiting for the seller to settle" with winner and price. After `Settled`: "SOLD", "Lot #1 sold to {nickname}", price, "{bids} bids · {refunds} refunds", "One transaction moved the NFT to {nickname} and {price} MON to the seller.", and the settle tx link. `no-bids`: "No bids. The NFT went back to the seller."
- [ ] **Step 6:** Phone result on `/a/[id]` from `Phone / Result — won/lost`: `won` → big "You won", "Batik Kawung → you", price, and the settle tx link once settled (else "The seller will settle in a moment"). `lost` → "All your MON is back", "{winner} placed the highest bid at {price} MON. Every bid you made was refunded the moment you were outbid.", balance. `no-bids` → "No bids this time. Nothing was spent." Skip the Your bids / Refunded / Gas paid stats (first cut item).
- [ ] **Step 7:** Run `npm test` (PASS), `npm run build`, then commit ("web: lobby, sold, results").

### Task 10: `/host` console **[M5]**

**Files:**
- Create: `web/app/host/page.tsx`

**Interfaces:**
- Consumes: `wagmiConfig` (injected), `nftAbi`, `auctionAbi`, `GAS`, `useAuction`, `useLatestAuction`, `txUrl`, `addressUrl`.

- [ ] **Step 1:** Build from `Host / Console`. Connect MetaMask (`useConnect` with `injected()`). If `chainId !== 10143`, show "Switch to Monad testnet" (`useSwitchChain`). Show the short address and balance.
- [ ] **Step 2: Step 1 "Mint the lot":** `safeMint(host, origin + "/lot/1.json")` with `gas: GAS.mint`. Read the tokenId from the receipt's `Transfer` log and show "LotNFT #{id} minted to your wallet" with the tx link. Keep the tokenId in state, and in `localStorage` so a reload keeps it.
- [ ] **Step 3: Step 2 "Approve and create the auction":** inputs prefilled with 0.05 / 0.01 / 60 / 10. Button 1 calls `approve(AUCTION_ADDRESS, tokenId)` (`gas: GAS.approve`), then shows "✓ Approved". Button 2 calls `create(NFT_ADDRESS, tokenId, parseEther(reserve), parseEther(step), duration, buffer)` (`gas: GAS.create`), then shows "✓ Created · tx", and "Auction #{id} is live. The NFT is held by the contract until settle." Each is a MetaMask pop-up; on rejection show "You rejected it in MetaMask. Try again."
- [ ] **Step 4: Step 3 "Settle":** `settle(id)` (`gas: GAS.settle`), enabled only when `secondsLeft === 0 && !settled`; while live it reads "Enabled when the clock ends ({clock} left)". After the receipt, show the tx link.
- [ ] **Step 5:** Side panel (cut item 3; keep it to a minimum): auction id, LIVE/ENDED, clock, top bid and bidder, links "Open big screen /screen", "Phone join link /join", "Contract on MonadVision".
- [ ] **Step 6: Full loop:** open the screen lobby, join from two burner browsers, mint, approve and create from MetaMask, bid back and forth, let it end, settle. Check that the NFT owner is the winner on MonadVision and the seller's balance went up.
- [ ] **Step 7:** `npm run build`, commit ("web: host console, full loop"), push. 5-line report, wait for "go".

### Task 11: Rehearsal fixes **[M6]**

- [ ] **Step 1:** Fahim rehearses with 4–6 phones on the Vercel URL. Collect what breaks.
- [ ] **Step 2:** Fix each issue with superpowers:systematic-debugging; add a test when the bug is in a `lib/` pure function.
- [ ] **Step 3:** If time allows, in this order: the "Use MetaMask instead" button on `/join` (injected connector, same bid page with a pop-up), then the Sold stats.
- [ ] **Step 4:** `npm run build`, commit, push, 5-line report.

### Task 12: Docs and polish **[M7]**

**Files:**
- Create: `contracts/EXPLAIN.md`
- Modify: `README.md`, `CLAUDE.md` (`/screen/[id]` row and the join flow)

- [ ] **Step 1:** Write `EXPLAIN.md`: one plain-English paragraph each for `create`, `bid`, `settle`, `withdraw`, `cancel`, `minNextBid`, and why `owed` exists. Written so Fahim can say it to a judge.
- [ ] **Step 2:** Update the `CLAUDE.md` `/screen/[id]` row to describe the per-bidder ranked feed (locked/refunded tags, "MON locked" figure), and the `/join` row and QR to describe join-first with plain `/join` plus auto-follow, and add `/screen` (lobby).
- [ ] **Step 3:** README: what it is (bid-and-run problem in two sentences), live URL, contract addresses with explorer links, how to run locally, demo order (QR → join → mint → list → bid → settle).
- [ ] **Step 4:** Grep the UI copy for banned words: `grep -riE "jackpot|lucky|win big|gamble|bet" web/app` returns nothing.
- [ ] **Step 5:** `npm run build`, commit ("docs: EXPLAIN, README, CLAUDE.md"), push. From 17:30, only fixes for broken things.
