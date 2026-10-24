# Aqad — real-time NFT auctions on Monad

> **Unaudited. Testnet only. Do not use with real assets.**

Photograph an item, mint it as an NFT, and auction it live for MON. The audience scans one QR
code and bids from their phones with MetaMask. The big screen shows the
countdown, a live leaderboard and Monad's speed measured in real time. Outbid bidders get every
wei back, late bids extend the clock, and settlement moves the NFT and the MON in one transaction.

Built for **Monad Blitz Jogja (24 Oct 2026)** with [MONSKILLS](https://skills.devnads.com).

| | |
|---|---|
| **Live app** | https://aqadmonad.vercel.app |
| **Join the running auction (one QR for the event)** | https://aqadmonad.vercel.app/live |
| Network | Monad Testnet · chain ID `10143` · RPC `https://testnet-rpc.monad.xyz` |
| **AuctionHouse** | [`0x3231cd2df88b70c687698fde7bbb7a3c31950e5f`](https://testnet.monadvision.com/address/0x3231cd2df88b70c687698fde7bbb7a3c31950e5f) · verified (MonadVision perfect match, Monadscan) |
| **DemoNFT** | [`0x2fb727b1b1ccec990029e4214986e02440dc0fd9`](https://testnet.monadvision.com/address/0x2fb727b1b1ccec990029e4214986e02440dc0fd9) · verified (MonadVision perfect match, Monadscan) |
| Source | https://github.com/ukkasyahahmad/aqadmonad |

## Try it in one minute

1. Get test MON for your MetaMask wallet from https://faucet.monad.xyz.
2. Open **https://aqadmonad.vercel.app/live** in MetaMask's in-app browser on your phone (or on
   desktop with the MetaMask extension) and connect.
3. Tap **Review bid** → **Confirm bid** and approve in MetaMask. The receipt comes back in about a second.
4. If someone outbids you, your phone shows **“You've been outbid!”** with **Bid again** and
   **Withdraw** buttons.

No auction running? Start one at `/create` with MetaMask, or stage one from the command line
(see [Stage a demo auction](#stage-a-demo-auction)).

## Pages

| Route | Who | What it does |
|---|---|---|
| `/` | everyone | Gallery of the latest 24 auctions with live status and countdowns |
| `/live` | audience | **One permanent QR target.** Shows the running lot and follows the next one automatically; if several run at once, the viewer picks |
| `/auction/[id]` | bidders | Bid panel (confirm dialog, pending, leading, price-changed, outbid, won/lost), on-chain bid history, token details, per-lot QR |
| `/screen/[id]` | projector | 16:9 audience screen: huge countdown, QR, leaderboard, participant count, bid flash, anti-sniping flash, confetti on SOLD, optional gavel sound, Monad speed panel |
| `/create` | sellers | 7-step wizard: category → details → photo → price & duration → review → mint → approve → create |
| `/host` | sellers | Your auctions with QR, audience-screen link, settle and cancel |
| `/account` | everyone | Your leading bids, your listings, watchlist |

## Monad features used

| Monad feature | How Aqad uses it | Where |
|---|---|---|
| `eth_sendRawTransactionSync` — receipt in the same RPC call | The speed probe (below) gets its receipt back in one request; MetaMask bids poll for the receipt every 250 ms. The UI shows the measured time | `web/hooks/use-tx.ts`, `use-speed-probe.ts` |
| `monadLogs` WebSocket — logs at the *Proposed* stage | The audience screen shows a bid before the bidder's own receipt arrives; reconnects with backoff, falls back to polling | `web/hooks/use-live-bids.ts` |
| ~0.3–0.4 s blocks | Measured live on the screen from block cadence (no hard-coded number) | `web/hooks/use-block-rate.ts` |
| Fast confirmation | **Speed probe**: the screen's own wallet sends a 0-MON self-transfer every 15 s via `eth_sendRawTransactionSync` and displays the real send→receipt time | `web/hooks/use-speed-probe.ts` |
| Gas charged on the **gas limit** | Every write uses `eth_estimateGas` from a Monad node + 10% (no blanket limits) | `web/hooks/use-tx.ts` |
| Reserve balance / async execution | 1.5 s pause after funding and between transactions of a low-balance (< 10 MON) wallet | `use-burner.ts`, `bid-panel.tsx` |
| 1-second `block.timestamp` | Countdowns anchor to the latest block timestamp and tick locally | `web/hooks/use-chain-time.ts` |
| `eth_getLogs` 100-block limit | Bid history scanned in 100-block windows from the auction's creation block, ≤ 4 requests in flight | `web/hooks/use-bid-history.ts` |

## How the auction works

| Rule | Enforced by the contract |
|---|---|
| Escrow | The seller's NFT moves into `AuctionHouse` when the auction is created |
| First bid | ≥ the starting price |
| Next bids | ≥ current highest bid + 5% (rounded **up**) |
| Bid again after being outbid | Allowed, any number of times |
| Raise your own winning bid | Not allowed (`AlreadyHighestBidder`) — you can't bid against yourself |
| Seller bids on own lot | Not allowed |
| Anti-sniping | A bid with < 60 s left moves the end to 60 s after that bid |
| Refunds | When outbid, your **full** bid is credited to `pendingReturns`; withdraw any time (pull payment) |
| Settlement | After the end time, `endAuction` sends the NFT to the winner and the MON to the seller **atomically** (no bids → NFT back to the seller). On-chain anyone may call it; the UI shows the button to the seller |
| Cancel | Seller only, and only before the first bid |

### Security

- **Pull payments** — `bid()` never sends MON out, so a bidder whose wallet rejects MON cannot block anyone else.
- **Checks-Effects-Interactions + `nonReentrant`** — balances are zeroed *before* MON is sent and every state-changing function is guarded, so nothing can be withdrawn or settled twice (the class of bug behind the 2016 DAO hack).
- **Atomic settlement** — if any transfer fails the whole call reverts; nothing is half-settled.
- **No admin** — no owner, pause, upgrade or rescue function. Nobody, including us, can move escrowed NFTs or MON outside the rules.
- **Tested invariant** — contract balance ≥ active top bids + pending refunds, exactly equal unless MON is force-sent; checked over 128,000 random transactions.

Plain-English walkthrough of every function: [`contracts/EXPLAIN.md`](contracts/EXPLAIN.md).

## Architecture

```
contracts/                   Foundry (solc 0.8.28, evm prague, OpenZeppelin 5.4)
  src/AuctionHouse.sol       auction + escrow + pull refunds; no admin functions
  src/DemoNFT.sol            free-mint ERC-721; mintWithURI stores item metadata on-chain
  test/                      unit + fuzz (AuctionHouse.t.sol, DemoNFT.t.sol), stateful invariants
  script/Deploy.s.sol        DemoNFT → AuctionHouse → 3 demo NFTs to the deployer
  script/deploy-testnet.sh   Monad Testnet deploy with an encrypted Foundry keystore
  EXPLAIN.md                 one paragraph per function
web/                         Next.js 16 App Router, React 19, wagmi 3, viem 2.57, Tailwind 4
  lib/         no React: chain/RPC config, contract bindings, auction rules, formatting,
               on-chain metadata codec, quick-bid wallet, sound
  hooks/       data + transactions: auctions, bid history, live feed, chain time,
               tx lifecycle, quick-bid wallet, block rate, speed probe, watchlist
  components/  UI (design from html-design/ and Design.md)
  app/         routes; app/api/{faucet,upload} are the only server code
  contracts/   abis.ts + deployedContracts.ts, GENERATED by `pnpm contracts:export`
  scripts/     export-contracts.mjs, seed-auction.mjs
```

- **No hard-coded contract addresses in the UI**: `pnpm contracts:export` reads the Foundry
  artifacts and `contracts/broadcast/Deploy.s.sol/10143/run-latest.json` and writes
  `web/contracts/abis.ts` and `web/contracts/deployedContracts.ts`.
- **All auction data comes from the chain** (contract reads + `BidPlaced` events). The only
  off-chain data is item photos (Vercel Blob; their URL is stored in the NFT's on-chain metadata)
  and the per-browser watchlist.

## Run it locally

Requirements: **Node 20+**, **pnpm**, **Foundry ≥ 1.8**. The web app talks to the deployed
contracts on Monad Testnet; no local chain or configuration is needed.

```sh
git clone https://github.com/ukkasyahahmad/aqadmonad.git && cd aqadmonad

# contracts: dependencies, build, tests
cd contracts
./install-deps.sh          # OpenZeppelin v5.4.0 + forge-std v1.17.0 into lib/
forge build
forge test                 # 52 unit/fuzz tests + 4 invariants (Foundry reports the invariant suite as 1)

# web app
cd ../web
pnpm install
pnpm dev                   # http://localhost:3000
```

Optional environment (`web/.env.local`, see `web/.env.example`):

| Variable | Needed for | Default |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Photo upload in `/create` (Vercel Blob; `vercel env pull`) | upload disabled, generated artwork used |
| `NEXT_PUBLIC_RPC_URL` | Preferred RPC endpoint | official Monad Testnet RPCs with fallback |
| `DRIP_CAP` | Max wallets funded by `/api/faucet` | 60 |

Other checks: `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Stage a demo auction

Creates a real auction on Monad Testnet without using anyone's key: a throwaway key is
generated in memory (never printed or saved), funded with 1 test MON by the MONSKILLS faucet,
then it mints an item NFT, approves and lists it.

```sh
cd web
node scripts/seed-auction.mjs 3 "Leica M6 rangefinder kit"   # minutes, item name
# → Auction #N live for 3 min … bid: …/auction/N  screen: …/screen/N
```

Set `APP_URL` to print links for another deployment.

## Deploy your own

1. **Wallet** — `cast wallet import deployer --interactive` (the key stays encrypted), then fund it
   from the official faucet https://faucet.monad.xyz
   ([docs](https://docs.monad.xyz/developer-essentials/testnets)).
2. **Contracts** — `./contracts/script/deploy-testnet.sh deployer`
   (deploys, mints 3 demo NFTs, runs `pnpm contracts:export`).
3. **Verify** — with the MONSKILLS verification API (MonadVision + Monadscan in one call):
   ```sh
   cd contracts
   forge verify-contract <ADDRESS> src/AuctionHouse.sol:AuctionHouse --chain 10143 --show-standard-json-input > std.json
   jq -n --arg a <ADDRESS> --slurpfile s std.json --argjson m "$(jq .metadata out/AuctionHouse.sol/AuctionHouse.json)" \
     '{chainId:10143, contractAddress:$a, contractName:"src/AuctionHouse.sol:AuctionHouse",
       compilerVersion:"v0.8.28+commit.7893614a", standardJsonInput:$s[0], foundryMetadata:$m}' > verify.json
   curl -X POST https://agents.devnads.com/v1/verify -H "Content-Type: application/json" -d @verify.json
   ```
   Repeat for `src/DemoNFT.sol:DemoNFT`.
4. **Web** — deploy `web/` to Vercel (`vercel deploy --prod`) and add `BLOB_READ_WRITE_TOKEN`
   (`vercel blob create-store <name> --access public` links it automatically).

## Three-minute demo

**Before going on stage**
- Host wallet (MetaMask) holds **more than 10 MON** (Monad reserve-balance rule).
- Create the lot 5 minutes before (`/create` or `seed-auction.mjs`), plus one spare lot.
- Projector: `/screen/<id>` in fullscreen; turn sound on (speaker icon); start the speed probe.
- QR for the room: **Host console → Event QR (/live)** opens a full-screen QR (or use **Fullscreen QR** on any lot). Phone hotspot as a Wi-Fi backup.

**On stage**
1. *Problem (20 s)* — auctions at events are slow and need trust in the auctioneer.
2. *Audience joins (40 s)* — everyone scans the QR, opens it in MetaMask → bids. The screen's
   leaderboard and wallet count climb; each bid flashes on screen.
3. *Bidding war (40 s)* — outbid phones buzz with **Bid again**; point at the refund: the old
   bid is credited in full, in the same transaction that outbid it.
4. *Anti-sniping (20 s)* — a bid in the last minute pushes the clock back to 60 s.
5. *Why Monad (30 s)* — the speed panel: block time and confirmation time measured live,
   versus Ethereum's ~12 s blocks.
6. *Settle (30 s)* — at zero the seller taps **Close auction & settle**: SOLD, confetti, the
   winner's phone shows **You won!**; open the transaction on the explorer.

## Verified

| Check | Result |
|---|---|
| Fresh clone of this repo → `./install-deps.sh`, `forge build`, `forge test` | pass — 55 tests: unit/fuzz + invariants (256 runs × 128,000 calls, 0 reverts) |
| Fresh clone → `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, all routes HTTP 200 with no `.env` | pass |
| Fresh clone → `pnpm contracts:export` | reproduces the committed `abis.ts` / `deployedContracts.ts` exactly |
| Testnet deployment + verification | redeployed 24 Oct 2026 (seller can end early; fresh auction history); both contracts verified via the MONSKILLS API (MonadVision “perfect match”; Monadscan verified). Auction numbers below refer to the previous deployment |
| `/create` with MetaMask: mint → approve → create (auction #1) | passed; NFT escrowed; no-bid `endAuction` returned it to the seller |
| Bidding (auction #2): quick-bid 0.05 → MetaMask outbid 0.0525 → withdraw → settle | passed; sync receipt 763 ms; `Withdrawn` 0.05 MON; NFT owner = winner; seller paid; AuctionHouse balance 0 |
| Audience screen (auction #3) | `monadLogs` live; bid on screen 0.67 s after Confirm, before the bidder's own receipt |
| Production site, phone viewport (auction #7): quick-bid wallet → faucet → bid | passed; faucet sent 1 MON; bid confirmed in 1,523 ms |
| `/live` + outbid flow (auction #8): A bids → B outbids → A sees the outbid alert → **Bid again** | passed; A leads again at 0.011025 MON; alert persists across reloads (read from on-chain refunds) |
| Speed probe on testnet | 0-MON self-transfer confirmed via `eth_sendRawTransactionSync` in 1.10 s; measured block time 0.27–0.32 s |
| Note | the quick-bid rows above were run before the quick-bid wallet was hidden (bidding is now MetaMask-only) |
| Not verified | vibration and the **You won!** banner on a physical phone; MetaMask mobile deep link |

## Limitations

- Unaudited; testnet only.
- Bidding needs MetaMask (extension, or the MetaMask app's browser on a phone). An in-browser
  quick-bid wallet exists in the code but is hidden (`QUICK_BID` in `web/components/bid-panel.tsx`);
  wallets created before that still show on `/account` so their refunds can be withdrawn.
- Faucet and upload rate limits are in-memory (per serverless instance).
- Rebidding needs a fresh deposit; the earlier bid stays withdrawable.
- A seller that rejects MON or a winning contract that rejects NFTs blocks settlement; assets
  stay escrowed and fully accounted for (see `contracts/EXPLAIN.md`).
- For physical items the NFT is a listing record; delivery happens off-chain.
- The gallery shows the latest 24 auctions.

## Built with

[MONSKILLS](https://skills.devnads.com) (scaffold, gas, concepts, verification API, faucet API) ·
Foundry · OpenZeppelin Contracts 5.4 · Next.js · wagmi · viem · Vercel. Design from `Design.md`
and `html-design/`.
