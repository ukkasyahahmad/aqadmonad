# CLAUDE.md: Aqad Lelang

Live auction for Monad Blitz Jogja (24 Oct 2026). Coding from 12:00, **freeze 18:00**. It must run live on **Monad testnet** at a real Vercel URL with real MetaMask pop-ups. "Aqad Lelang" is a working name.

**What it is:** every bid locks real MON in the contract. When someone outbids you, your MON comes back in the same transaction. When the clock ends, one `settle()` sends the NFT to the winner and the MON to the seller. No bid-and-run. Not betting: no bid fees, losers get 100% back, no randomness. Never use gambling words in the UI ("win big", "jackpot", "lucky").

Fahim is a full-stack dev, new to Solidity. Keep the contract small, commented and explainable. Prefer less code everywhere.

## Layout

```
contracts/   Foundry: src/AqadLelang.sol, src/LotNFT.sol, test/, script/
web/         Next.js App Router + TypeScript + Tailwind + shadcn/ui + wagmi + viem
web/public/lot/   item images + tokenURI JSON (<id>.json), served from the app URL (IPFS later)
DESIGN.md    design tokens: Geist / Geist Mono, stone greys, violet #4F35C9, 52 px controls, no red
.monskills   built-with=monskills, chain=monad-testnet
```

## Tools

- **MONSKILLS:** start with the `monskill` routing skill, then `scaffold`, `gas`, `concepts` (reserve balance, async execution), `addresses`. Use the local copies.
- **OpenZeppelin MCP:** `solidity-erc721` for `LotNFT`. The auction is custom code on OpenZeppelin imports (`ReentrancyGuard`, `IERC721`). Install with `forge install --no-git OpenZeppelin/openzeppelin-contracts`.
- **This file wins over monskills:** no Para or Privy wallets (MetaMask via wagmi `injected()`, plus in-page burners); no Alchemy Agent Wallet (deploy with `forge script` and `DEPLOYER_PRIVATE_KEY` from `contracts/.env`); no indexer (`getLogs` / `watchContractEvent`). Do use the monskills verification API.

## Commands

```bash
cd contracts && forge build && forge test -vv && forge test --gas-report
cd contracts && forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
cd web && npm run dev      # npm run build must pass before every push
```

## Contract: `AqadLelang.sol` (native MON)

- `create(nft, tokenId, reserve, minStep, duration, buffer) → id`: pulls the NFT (seller approves first) and sets `endsAt`.
- `bid(id) payable nonReentrant`: revert if ended or `msg.value < minNextBid(id)`; write the new top bid **before** moving money; if inside `buffer`, set `endsAt = now + buffer` and emit `Extended`; refund the previous top with `call{gas: 30_000}`, and on failure credit `owed[prev]` (never revert); emit `BidPlaced(id, bidder, amount, endsAt, prevBidder, refunded)`.
- `settle(id) nonReentrant`: anyone, after `endsAt`, once. NFT to the winner via `transferFrom`, MON to the seller (fallback `owed`). With no bids, the NFT goes back to the seller. Emits `Settled`.
- `withdraw()`: pays out `owed`. **Keep it**, it's the safety valve.
- `cancel(id)`: seller only, before any bid. First to cut.
- `minNextBid(id) view`: `topBid == 0 ? reserve : topBid + minStep`.
- Tests that must pass: reserve; same-tx refund; step; anti-snipe extend; bid after end reverts; settle once; settle with no bids; rejecting bidder → `owed` + `withdraw`.
- After deploy, write `contracts/EXPLAIN.md`: one plain-English paragraph per function.

## Demo journey (build exactly this)

| Route | Who | Must do |
|---|---|---|
| `/host` | seller laptop, MetaMask | mint lot, approve, create (defaults: reserve 0.05 MON, step 0.01, 60 s, buffer 10 s), Settle after the end |
| `/join` | audience phone | make a burner key (viem `generatePrivateKey`, kept in `localStorage`), call `/api/drip` for 1 MON, then go to `/a/[id]` |
| `/a/[id]` | phone | countdown, top bid, one big "Bid {minNextBid} MON" button signed in-page (no pop-up), outbid refund shown ("Outbid, 0.12 MON is back in your wallet"). On `BidTooLow`: "Someone got there first. Tap again." When ended, the winner sees a big **"You won"** plus an explorer link; others see "All your MON is back" |
| `/screen/[id]` | big screen 16:9 | QR to `/join`, huge countdown, **ranked top-bidders leaderboard** built from `BidPlaced` events, "+10 s" flash on `Extended`, Sold view with settle tx link. Live updates over `wss`, falling back to `getLogs` polling every 500 ms |
| `/api/drip` | Vercel route | `FUNDER_PRIVATE_KEY` server-side only; 1 MON, gas 21,000, once per address, global cap `DRIP_CAP` (60) |

Nicknames (e.g. "Gudeg-42", derived from the address) and a "Use MetaMask instead" option on phones are nice-to-haves.

## Monad rules

- **Gas is charged on the gas limit, not gas used.** Set explicit limits from the gas report (+10–20%) for `bid`, `create` and `settle`; 21,000 for drips.
- **Reserve balance:** accounts under 10 MON can send one tx per ~1.2 s, and newly funded accounts must wait ~1.2 s. So wait 1.5 s after the drip before enabling Bid, and keep Bid disabled 1.5 s after each receipt. The funder must stay above 10 MON.
- **`block.timestamp` has 1 s granularity.** Count down from `endsAt` minus the latest block timestamp, then tick locally.
- Monad testnet: chain id **10143**. RPCs: `https://testnet-rpc.monad.xyz` (50 rps, 25 for `eth_call`; wss at the same host), `https://rpc-testnet.monadinfra.com` (20 rps), `https://rpc.ankr.com/monad_testnet`. Use wagmi `fallback()`; prefer `NEXT_PUBLIC_RPC_URL` if set. Phones poll once a second with one multicall.
- Fast receipts: use `eth_sendRawTransactionSync` via viem if available (viem ≥ 2.40), else `waitForTransactionReceipt` with 200 ms polling. Show the measured confirm time on the bidding phone only; never fake numbers.
- Explorer: `https://testnet.monadvision.com/tx/<hash>`.

## Rules

- Never print, log or commit private keys. Every `.env*` goes in `.gitignore` before the first commit. Keys are testnet-only.
- Work in milestones; after each, stop and say in 5 lines what works and how to test it. Commit at each milestone, and keep Vercel deployed from the first hour.
- Out of scope: USDC, escrow for off-chain items, multiple lots, a database, accounts, bots, mainnet.
- **Cut order if late:** `cancel()` → nicknames → MetaMask-on-phone. Never cut money-backed bids, same-tx refunds, the 10 s extension, one-tx settle, `withdraw()`, or the MetaMask pop-ups on `/host`.
- After 17:30, change code only to fix something broken.
