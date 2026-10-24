# Aqad Lelang

Real-time NFT auction dApp on **Monad Testnet** (chain 10143) for Monad Blitz Jogja.
A seller escrows an ERC-721; bidders send native MON; each outbid is refunded in the
same transaction (or credited for withdrawal if the transfer fails). No fees, no randomness.

> **Unaudited. Testnet only. Do not use with real assets.**

## Layout

- `contracts/` — Foundry (solc 0.8.28, OpenZeppelin 5.7.0)
- `web/` — Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, wagmi 3, viem 2

## Local setup

```sh
# contracts
cd contracts && ./install-deps.sh && forge build
# web
cd web && pnpm install && pnpm dev
```

Testnet MON: official faucet listed in Monad docs — https://faucet.monad.xyz
(source: https://docs.monad.xyz/developer-essentials/testnets).

_Status: milestone 1 (scaffold). Contracts, deployment, and demo steps are added in later milestones._
