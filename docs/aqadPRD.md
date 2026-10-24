# Coding-agent prompt: Aqad Lelang

For Monad Blitz Jogja, 24 Oct 2026. Paste the prompt below into Claude Code at **12:00 on the day**, in an empty project folder. Organisers asked that no project code be written before 12:00, so tonight only install the tools in step 1 and read this file.

"Aqad Lelang" is a working name. If the name changes, replace it in the prompt before pasting.

## 1. Tonight: install the tools (no project code)

Run these in a scratch folder or globally. They install tooling, not project code.

**Monad skills (MONSKILLS by Harpal Jadeja, skills.devnads.com; MIT licensed, not stated to be an official Monad Foundation product).** In Claude Code:

```text
/plugin marketplace add therealharpaljadeja/monskills
/plugin install monskills@monskills
```

Or for any agent: `npx skills add therealharpaljadeja/monskills`. It ships a `monskill` routing skill plus `scaffold`, `gas`, `concepts` (async execution, reserve balance), `addresses`, `wallet`, `wallet-integration`, `tooling-and-infra`, `indexer`, `why-monad`.

**OpenZeppelin Contracts MCP (Solidity).** Hosted:

```bash
claude mcp add -t http OpenZeppelinSolidityContracts https://mcp.openzeppelin.com/contracts/solidity/mcp
```

Or local (needs Node): `claude mcp add OpenZeppelinContracts -- npx -y @openzeppelin/contracts-mcp`. Its tools are named `solidity-erc20`, `solidity-erc721`, `solidity-erc1155`, `solidity-custom` and so on. It generates contracts from Contracts Wizard templates. There is no auction template, so the auction contract is custom code built on OpenZeppelin pieces.

**Other tools:** Node 20+, Foundry v1.8 or later (Monad's docs require it; `foundryup`), a Vercel account linked to GitHub.

**Things the prompt expects you to have ready at 12:00:**

- `DEPLOYER_PRIVATE_KEY`: a testnet-only wallet with a few MON for deploys.
- `FUNDER_PRIVATE_KEY`: a testnet-only wallet holding about 80 MON for the burner drip.
- Your MetaMask host address (the seller) and the Lot #1 image (square PNG).
- Optional: a keyed Alchemy or QuickNode Monad testnet RPC URL.
- A copy of `/mnt/project-files/aqad/DESIGN.md` to drop in the project root.

Never paste these keys into the chat. Put them in `.env` files yourself when the agent asks.

## 2. Check the setup at 12:00

1. Open an empty folder, copy `DESIGN.md` into it, start `claude`.
2. Run `/mcp` and check that the OpenZeppelin server is connected.
3. Check that the monskills skills are listed (ask "which monskills skills do you have?").
4. Paste the prompt below.

## 3. The prompt

````markdown
You are building **Aqad Lelang** with me today at Monad Blitz Jogja, a one-day hackathon. Coding started at 12:00 and the code freeze is **18:00**. It must be live on **Monad testnet** at a real Vercel URL, with real MetaMask pop-ups, and demoed in 2 minutes. I'm a full-stack developer but new to Solidity, so keep the contract small and readable; judges mark down builders who can't explain their code.

## Tools you must use

1. **MONSKILLS** (installed locally). Start with the `monskill` routing skill, then read the topic skills you need: `scaffold`, `gas`, `concepts` (read its reserve-balance and async-execution references), `addresses`, `why-monad`. Use the local copies, not the website.
2. **OpenZeppelin Contracts MCP**. Use `solidity-erc721` to generate the lot NFT (mintable by owner, URI storage or a fixed base URI). For the auction contract there is no template: write it yourself on top of OpenZeppelin imports (`ReentrancyGuard`, `IERC721`). Install OpenZeppelin with `forge install --no-git OpenZeppelin/openzeppelin-contracts`.
3. Read `DESIGN.md` in the project root and use its tokens (Geist and Geist Mono, stone greys, violet `#4F35C9`, 52 px controls, no red for states).

Where monskills and this prompt disagree, **this prompt wins**:
- Do not use Para for wallets (`wallet-integration`). Use wagmi with the `injected()` connector for MetaMask, plus in-page burner wallets (below).
- Do not use the Alchemy Agent Wallet for deploys (`wallet`). Deploy with `forge script` using `DEPLOYER_PRIVATE_KEY` from `contracts/.env`, which I will fill in. Never print or commit keys. Add every `.env` to `.gitignore` before the first commit.
- Do not build an indexer. Read events with `getLogs` / `watchContractEvent`.
- Do follow the monskills scaffold layout (`contracts/` Foundry, `web/` Next.js App Router + shadcn + wagmi), the tsconfig ES2020 fix, the gas-limit guidance, and the verification API for explorers.

## Product brief (PRD)

**Problem.** In Indonesian Facebook and WhatsApp lelang (auction) groups, bidders type bids as comments and the winner often never pays ("bid and run"). Sellers keep blacklists by hand. Fast live auctions so far either take real money and run for days (Nouns, SuperRare) or run fast with bids that are only promises (BidBlitz at Monad Blitz Hyderabad: bids carried no money, the winner had 3 minutes to pay or walk).

**Promise.** A live auction where every bid is real money. Your bid is locked in the contract, the bidder you beat is refunded in the same transaction, and when the clock hits zero one transaction sends the NFT to the winner and the money to the seller. Only practical on a chain with 300 ms blocks and tiny fees.

**Users.**
- Host/seller (me, on a laptop with MetaMask): mints the lot, starts the auction, settles it.
- Bidders (the audience, on phones): scan a QR, get a burner wallet with test MON, tap Bid.
- The room (big screen, 16:9): watches the clock, top bid and live bid feed.

**Not betting.** No bid fees, losers get 100% back, no randomness, the highest bid wins a real item. Never use gambling words in the UI (no "win big", "jackpot", "lucky").

**In scope today.**
1. `AqadLelang.sol` auction contract and `LotNFT.sol`, with tests, deployed and verified on Monad testnet (chain id 10143).
2. Phone pages: Join, Bid, Result.
3. Big screen pages: Lobby, Live, Sold.
4. Host console: mint lot, create auction, settle.
5. `/api/drip` serverless route that funds burners.
6. Deployed on Vercel. README with contract addresses and explorer links.

**Out of scope (pitch only).** USDC payments, off-chain items via escrow, multiple lots per room, reputation, mainnet, user accounts, a database.

**Acceptance criteria.**
- Two phones can outbid each other; each outbid phone sees its MON returned in the same tx as the new bid.
- A bid in the last 10 s visibly extends the clock on the big screen.
- After the clock ends, Settle (one MetaMask pop-up) moves the NFT to the winner and the money to the seller.
- The big screen shows each bid within about 1 s; the bidding phone shows its own measured confirm time ("confirmed in 0.4 s").
- Works with 30 phones without hitting RPC rate limits.

## Contract spec: `contracts/src/AqadLelang.sol`

Native MON only (one tx per bid). Solidity ^0.8.24, custom errors, NatSpec on every function, comments that explain the why.

Storage:
```solidity
struct Auction {
    address seller;
    address nft;
    uint256 tokenId;
    uint128 reserve;    // first bid must be >= reserve
    uint128 minStep;    // next bid must be >= topBid + minStep
    uint64  endsAt;     // unix seconds
    uint32  buffer;     // anti-snipe window in seconds, e.g. 10
    address topBidder;
    uint128 topBid;
    bool    settled;
}
mapping(uint256 => Auction) public auctions;
mapping(address => uint256) public owed; // refunds that could not be pushed
uint256 public nextId;
```

Functions:
- `create(address nft, uint256 tokenId, uint128 reserve, uint128 minStep, uint64 duration, uint32 buffer) returns (uint256 id)`: pulls the NFT with `transferFrom` (seller approves first), sets `endsAt = block.timestamp + duration`, emits `AuctionCreated`.
- `bid(uint256 id) payable nonReentrant`:
  1. revert `AuctionEnded` if `block.timestamp >= endsAt` or settled;
  2. revert `BidTooLow(minNext)` if `msg.value < minNextBid(id)`;
  3. save previous top bidder and amount;
  4. write the new top bidder and amount (state before money);
  5. if `endsAt - block.timestamp < buffer`, set `endsAt = block.timestamp + buffer` and emit `Extended`;
  6. refund the previous bidder with `call{value: amount, gas: 30_000}`; if it fails, add to `owed[prev]` instead of reverting;
  7. emit `BidPlaced(id, bidder, amount, endsAt, prevBidder, refundedAmount)`.
- `settle(uint256 id) nonReentrant`: anyone, only after `endsAt`, only once. No bids: NFT back to seller. Otherwise NFT to winner with `transferFrom` (not `safeTransferFrom`, so a contract winner can't block it) and money to seller (fallback to `owed` if the push fails). Emit `Settled(id, winner, amount)`.
- `withdraw() nonReentrant`: pays out `owed[msg.sender]`.
- `cancel(uint256 id)`: seller only, only before any bid. Lowest priority; skip if behind.
- `minNextBid(uint256 id) view`: `topBid == 0 ? reserve : topBid + minStep`.

Events: `AuctionCreated(id, seller, nft, tokenId, reserve, minStep, endsAt)`, `BidPlaced(...)`, `Extended(id, endsAt)`, `Settled(id, winner, amount)`. Index `id` and addresses.

Foundry tests (`contracts/test/AqadLelang.t.sol`), all must pass before any front end work:
1. bid below reserve reverts, at reserve succeeds;
2. second bid refunds the first bidder in the same tx (assert balances);
3. bid below top + minStep reverts with `BidTooLow`;
4. bid inside the last `buffer` seconds sets `endsAt = now + buffer`;
5. bid after `endsAt` reverts;
6. settle moves NFT and money; second settle reverts;
7. settle with no bids returns the NFT;
8. a bidder contract that rejects MON gets `owed` and does not block the next bid; `withdraw` pays it.

Report the gas used by `bid` (first bid and outbid) from `forge test --gas-report`. We will hardcode the gas limit at that number plus 10 to 20%.

`LotNFT.sol`: generate with the OpenZeppelin MCP `solidity-erc721` tool (Ownable, mintable). Token URI points to `https://<vercel-url>/lot/<id>.json`, served from `web/public/lot/`.

Deploy with `forge script` to `https://testnet-rpc.monad.xyz` (chain 10143), verify with the monskills verification API, write the addresses to `web/lib/contracts.ts` and the README.

## Monad rules that matter for this app (from monskills `gas` and `concepts`)

- **Gas is charged on the gas limit, not gas used.** Set explicit gas limits for `bid`, `settle`, `create` from the measured numbers; never let a wallet fall back to a huge default. For the drip (plain MON transfer) use 21,000.
- **Reserve balance:** an account under 10 MON can send one tx per 3 blocks (about 1.2 s), and a newly funded account must wait about 1.2 s before sending. So: after a drip, wait 1.5 s before enabling Bid; after each bid receipt, keep the Bid button disabled 1.5 s. The funder stays above 10 MON.
- **`block.timestamp` has 1 s granularity**; several blocks share it. Compute countdowns from `endsAt` minus the latest block timestamp, then tick locally.
- **Fast receipts:** Monad supports `eth_sendRawTransactionSync`. For burner bids use viem's sync send if the installed viem version has it (check the version, need viem >= 2.40); otherwise `writeContract` then `waitForTransactionReceipt` with a 200 ms polling interval. Measure send-to-receipt time and show it.
- **RPC limits:** `https://testnet-rpc.monad.xyz` 50 rps (25 for `eth_call`), `https://rpc-testnet.monadinfra.com` 20 rps, Ankr `https://rpc.ankr.com/monad_testnet` 300 per 10 s. Use wagmi `fallback()` across them. Phones read auction state once per second (one multicall: `auctions(id)`, `minNextBid(id)`, own balance). The big screen subscribes over `wss://testnet-rpc.monad.xyz` (fallback: `getLogs` polling every 500 ms). Use `NEXT_PUBLIC_RPC_URL` first if I set a keyed one.
- Explorer links: `https://testnet.monadvision.com/tx/<hash>`.

## Front end spec (`web/`)

Next.js App Router, TypeScript, Tailwind + shadcn/ui, wagmi + viem, tokens from `DESIGN.md`. Mobile-first for phone pages, 16:9 for screen pages, readable from 10 m away (countdown at least 20vh).

**Burner wallet (phones).** On `/join`, create a key with viem `generatePrivateKey()` and keep it in `localStorage` (reuse it on reload). Show a nickname derived from the address: pick from a fixed list of Jogja food and place words plus two digits, e.g. "Gudeg-42", "Bakpia-07", "Malioboro-19", so the same address always gets the same name and nothing is stored. Bids from burners are signed in the page with a viem wallet client: no pop-up. Also show "Use MetaMask instead" which uses the injected connector, so a judge can bid with a real pop-up.

**`/api/drip` (Vercel route).** POST `{ address }`. Uses `FUNDER_PRIVATE_KEY` (server env only). Sends 1 MON with gas 21,000 if the address has under 0.5 MON and has not been dripped before (in-memory set is fine; also check on-chain balance), with a global cap of 60 drips (`DRIP_CAP`). Returns the tx hash. Rate-limit per IP lightly. Never expose the key to the client.

**Pages.**
| Route | Who | Content |
|---|---|---|
| `/join` | phone | lot image, nickname, drip status ("Getting you 1 test MON…" then balance), button to `/a/[id]` |
| `/a/[id]` | phone | countdown, top bid and top nickname, status chip ("You're the top bid", "Outbid, 0.12 MON is back in your wallet"), balance, one big button "Bid {minNextBid} MON". On `BidTooLow`, show "Someone got there first. Tap again for {new min}" and refresh. When ended: result (won: NFT + explorer link; lost: "All your MON is back") |
| `/screen/[id]` | big screen | before start: big QR to `/join?a=[id]` and the lot. Live: huge countdown, top bid, top nickname, bid feed (nickname, amount, "confirmed in 0.4 s", "0.12 MON refunded to Soto-17 in the same tx", explorer link), "+10 s" flash on `Extended`, small QR in a corner. Sold: winner, price, settle tx link, stats (bids, refunds, peak MON locked, defaults: 0) |
| `/host` | laptop | connect MetaMask, mint Lot NFT, approve + create auction (defaults: reserve 0.05 MON, step 0.01 MON, 60 s, buffer 10 s), Settle button (enabled after the end), links to `/screen/[id]` |

Confirm time on the big screen: the phone that sent the tx knows its own latency, but the screen doesn't, so on the screen show the block-to-screen delay or simply the block number and "final in 0.6 s". Keep it truthful; don't fake numbers.

Error states: wallet rejected, wrong network (offer to switch to Monad testnet 10143), insufficient balance, RPC rate-limited (retry with backoff, show "Network busy, retrying").

## Working rules

- Work in the milestones below. At the end of each, stop, tell me in 5 lines what works and how to test it, and wait for me to say go. Commit at each milestone.
- Deploy to Vercel in milestone 1 and keep it deployed; I'll connect the GitHub repo in Vercel myself.
- Prefer less code. If a milestone runs more than 20 minutes over, propose what to cut (cut order: `cancel()`, Lobby state, peak-locked stat, separate result view, drip route → pre-funded QR cards).
- Don't add features outside this brief, bots, AI bidders, a database, or USDC.
- After the contract is deployed, write `contracts/EXPLAIN.md`: each function in plain English, one paragraph each, so I can answer judges.

## Milestones (times are targets)

1. **12:00 to 12:30** Scaffold per monskills `scaffold` (`contracts/` Foundry, `web/` Next.js + shadcn + wagmi, tsconfig ES2020, `.gitignore`, `.monskills` with `chain=monad-testnet`). A page on Vercel that reads the latest Monad testnet block number.
2. **12:30 to 13:30** Contracts + 8 tests passing + gas report. Deploy and verify. Mint Lot #1. Run one bid from a fresh 1-MON wallet with `cast` to confirm the reserve-balance behaviour.
3. **13:30 to 14:30** `/join`, burner wallet, `/api/drip`, `/a/[id]` Bid flow with explicit gas and debounce.
4. **14:30 to 15:30** `/screen/[id]` with live events, countdown from block time, feed, extension flash, QR.
5. **15:30 to 16:15** `/host` (mint, approve, create, settle) and the Sold / result views. Full loop with MetaMask.
6. **16:15 to 17:00** I rehearse with 4 to 6 phones; you fix what breaks.
7. **17:00 to 17:30** Polish copy, README (what it is, addresses, explorer links, how to run), `EXPLAIN.md`.
8. **17:30** Stop changing code unless something is broken. Freeze at 18:00.

Start now with milestone 1. First tell me in a few lines which skills you read and what you'll scaffold.
````

## 4. Notes for Fahim

- The prompt overrides two monskills defaults on purpose: Para social-login wallets (too much setup for 6 hours, and the burner flow needs no login) and the Alchemy Agent Wallet for deploys (needs browser sign-in steps). If you'd rather deploy with Alchemy's agent wallet, set it up tonight and delete that line.
- The drip and deploy keys are testnet-only. Make fresh wallets for them; never reuse a wallet that holds real funds.
- If the agent asks for a design decision the prompt doesn't cover, the build plan has the answer: `/mnt/project-files/auction/live-auction-build-plan.md`.

## Sources checked (23 Oct 2026)

- MONSKILLS repo and install guide: https://github.com/therealharpaljadeja/monskills (skills `scaffold`, `gas`, `concepts`, `wallet`), site https://skills.devnads.com
- OpenZeppelin MCP: https://mcp.openzeppelin.com (Solidity server `contracts/solidity/mcp`, Claude Code command from https://github.com/OpenZeppelin/openzeppelin-mcp), tool names from the Contracts Wizard MCP README (`@openzeppelin/contracts-mcp`)
- Monad deployment summary: https://docs.monad.xyz/developer-essentials/summary (gas on limit, 10 MON reserve, 1 s timestamps, Foundry ≥ 1.8, viem ≥ 2.40)
- Monad reserve balance: https://docs.monad.xyz/developer-essentials/reserve-balance
- Monad testnet info: https://docs.monad.xyz/developer-essentials/testnet (chain 10143, RPC endpoints and rate limits, MonadVision and Monadscan)
