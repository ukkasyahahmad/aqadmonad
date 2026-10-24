# Aqad — real-time NFT auctions on Monad

> **Unaudited. Testnet only. Do not use with real assets.**

Photograph an item, mint it as an NFT, and auction it live for MON. Phones scan a QR code and
bid in one tap; the big screen updates in real time; outbid bidders get every wei back; late
bids extend the clock; anyone can settle when time runs out.

Built for **Monad Blitz Jogja (24 Oct 2026)** with [MONSKILLS](https://skills.devnads.com).

| | |
|---|---|
| Live app | https://aqadmonad.vercel.app |
| Network | Monad Testnet · chain ID `10143` · RPC `https://testnet-rpc.monad.xyz` |
| AuctionHouse | [`0x3231cd2df88b70c687698fde7bbb7a3c31950e5f`](https://testnet.monadvision.com/address/0x3231cd2df88b70c687698fde7bbb7a3c31950e5f) (block 73769798) · verified: MonadVision perfect match, Monadscan |
| DemoNFT | [`0x2fb727b1b1ccec990029e4214986e02440dc0fd9`](https://testnet.monadvision.com/address/0x2fb727b1b1ccec990029e4214986e02440dc0fd9) (block 73769795) · verified: MonadVision perfect match, Monadscan |
| Explorer | https://testnet.monadvision.com |

## What it does

- **Sell an item** (`/create`): 7-step wizard — category, details, photo, price & duration,
  review, then three real transactions: mint the item NFT → approve → create the auction.
- **Bid** (`/auction/[id]`): confirm dialog, pending, leading, “price changed” recovery,
  ended/cancelled states — every state comes from the chain or a real transaction.
- **Quick-bid wallet**: phones without a wallet get a throwaway in-browser key, funded with
  1 test MON from the monskills faucet API. Bids are signed locally and sent with
  `eth_sendRawTransactionSync`, so the receipt comes back in the same request; the UI shows
  the measured latency. MetaMask works too.
- **Audience screen** (`/screen/[id]`): 16:9, 20vh countdown from chain time, QR to the bid
  page, live bid feed over WebSocket `monadLogs`, anti-sniping flash, final result.
- **Host console** (`/host`): your auctions with QR, screen link, settle and cancel.
- **Account** (`/account`): your leading bids, your listings, watchlist; outbid refunds
  appear in a banner with a one-click withdraw.

## Monad features used

| Monad feature | Where |
|---|---|
| `eth_sendRawTransactionSync` (receipt in one RPC call) | Quick-bid wallet writes (`web/hooks/use-tx.ts`, viem `writeContractSync`) |
| `monadLogs` WebSocket subscription (logs at *Proposed* state) | Audience screen live feed (`web/hooks/use-live-bids.ts`) |
| ~400 ms blocks, 1-second `block.timestamp` | Countdown anchored to the latest block, ticking locally (`use-chain-time.ts`) |
| Gas charged on **gas limit** | Every write uses `estimateGas` from a Monad node + 10% (no blanket limits) |
| Reserve balance / async execution | 1.5 s wait after funding and after each bid from a low-balance wallet |
| `eth_getLogs` 100-block limit | Bid history scanned in 100-block windows from the auction's creation block |

## How the auction works

- **Escrow**: the NFT moves into `AuctionHouse` when the auction is created.
- **Bids**: first bid ≥ starting price; each next bid ≥ previous + 5% (rounded up).
- **Refunds (pull payments)**: when you are outbid, your full bid is credited to
  `pendingReturns`; withdraw any time. `bid()` never sends MON out, so a hostile bidder
  cannot block others.
- **Anti-sniping**: a bid with < 60 s left moves the end to 60 s after that bid.
- **Settlement**: after the end time, *anyone* calls `endAuction`. NFT → winner, MON → seller,
  atomically (or NFT back to the seller if there were no bids). Expiry alone settles nothing.
- **Cancel**: the seller can cancel only before the first bid.

Plain-English walkthrough of every function: [`contracts/EXPLAIN.md`](contracts/EXPLAIN.md).

## Architecture

```
contracts/                 Foundry (solc 0.8.28, OpenZeppelin 5.4)
  src/AuctionHouse.sol     auction + escrow + pull refunds (no admin functions)
  src/DemoNFT.sol          free-mint ERC-721 with optional on-chain metadata
  test/                    unit, fuzz and stateful invariant tests
  script/Deploy.s.sol      deploy DemoNFT, AuctionHouse, mint 3 demo NFTs to the deployer
  script/deploy-testnet.sh Monad Testnet deploy with an encrypted Foundry keystore
web/                       Next.js 16 App Router, wagmi 3, viem 2.57, Tailwind 4
  lib/        domain + infrastructure: auction rules, formatting, chain/RPC, contracts,
              metadata codec, burner wallet  (no React)
  hooks/      application layer: data fetching, tx lifecycle, chain time, live feed
  components/ presentation (design tokens from html-design / Design.md)
  app/        routes; app/api/{upload,faucet} are the only server code
  contracts/abis.ts, deployedContracts.ts   generated ABIs + Monad Testnet addresses
```

Contract addresses are never hard-coded in components: `pnpm contracts:export` reads the Foundry
artifacts and the Monad Testnet broadcast, and writes `web/contracts/abis.ts` and
`web/contracts/deployedContracts.ts`.

## Run it locally

Requirements: Node 20+, pnpm, Foundry ≥ 1.8. The web app always talks to **Monad Testnet**
(official RPCs + `wss://testnet-rpc.monad.xyz`); there is no local-chain mode in the UI.

```sh
# contracts: build + tests (Foundry runs these in its own in-memory EVM)
cd contracts
./install-deps.sh                 # OpenZeppelin v5.4.0 + forge-std v1.17.0 into lib/
forge build
forge test                        # 52 unit/fuzz tests + 4 invariants

# web: runs against the deployed Monad Testnet contracts
cd ../web
pnpm install
pnpm dev                          # http://localhost:3000
```

Photo uploads need `BLOB_READ_WRITE_TOKEN` in `web/.env.local` (`vercel env pull`);
everything else works without configuration.

## Deploy to Monad Testnet

Keys never touch this repo or the agent. Two options:

- **Foundry keystore**: `cast wallet import deployer --interactive`, fund it from the
  official faucet https://faucet.monad.xyz (listed at
  [docs.monad.xyz/developer-essentials/testnets](https://docs.monad.xyz/developer-essentials/testnets)), then
  `forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --account deployer --broadcast`.
- **MONSKILLS Agent Wallet**: CREATE2 through CreateX with the Alchemy CLI session signer.

Then `cd web && pnpm contracts:export`, verify via the MONSKILLS verification API, and
deploy `web/` to Vercel. Vercel env: `BLOB_READ_WRITE_TOKEN` (photo uploads), optional
`NEXT_PUBLIC_RPC_URL`.

## Two-minute demo

1. Host opens `/create`, taps **Fill demo listing**, adds a photo, publishes (mint → approve →
   create). The confirmation shows the auction QR.
2. Open `/screen/<id>` on the projector. Two phones scan the QR → **Get 1 test MON** → bid.
3. Phone B outbids A. A sees **“Outbid — withdraw … MON refund”** and withdraws.
4. Bid in the final 60 s → the screen flashes the anti-sniping extension.
5. At zero the state reads **Awaiting settlement**; anyone taps **End auction & settle**.
6. Show the NFT owner (winner) and the seller's proceeds via the explorer links.

## Verified so far

| Check | Result |
|---|---|
| `forge build` | passes |
| `forge test` | 55 tests pass (unit/fuzz + invariants) (128,000 invariant calls, 0 reverts) |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | pass |
| Browser E2E on a local anvil chain (before switching the app to testnet-only): create → bid → outbid → withdraw → expire → settle | passed; NFT owner = winner, contract balance 0 after settlement |
| `eth_sendRawTransactionSync`, `monadLogs` WebSocket, monskills faucet — probed on Monad Testnet | work (sync receipt 997 ms from Jogja; faucet sent 1 MON) |
| Testnet deployment | done (24 Oct 2026, deployer `0x6265…Ff75`) |
| Verification (MONSKILLS verify API) | both contracts: MonadVision “perfect match”; Monadscan shows the source as a Similar Match (identical bytecode was already verified there) |
| Testnet E2E in a browser with MetaMask: `/create` mint → approve → create (auction #1) | passed; token #4 escrowed in AuctionHouse; `endAuction(1)` with no bids returned it to the seller |
| Testnet E2E bidding (auction #2): quick-bid 0.05 → MetaMask outbid 0.0525 → quick-bid withdraw → settle from the page | passed; sync receipt 763 ms; `Withdrawn` 0.05 MON; NFT owner = winner; seller paid; AuctionHouse balance 0 |
| Audience screen live feed on testnet (auction #3) | `monadLogs` WebSocket live; bid on screen 0.67 s after the phone tapped Confirm (before its own receipt), anti-sniping flash at 1.3 s; history after a reload in ~2 s |

## Limitations

- Unaudited. Faucet and upload rate limits are in-memory (per serverless instance).
- Quick-bid wallet keys live in browser `localStorage` — fine for test MON, never for real funds.
- A seller that rejects MON or a winning contract that rejects NFTs blocks settlement (assets
  remain escrowed and accounted for). See `EXPLAIN.md`.
- The gallery shows the latest 24 auctions.
