#!/usr/bin/env sh
# Deploys DemoNFT + AuctionHouse to Monad Testnet with a Foundry keystore account
# (the private key stays encrypted; forge asks for the keystore password).
# Usage: ./script/deploy-testnet.sh <keystore-account-name>
set -e
cd "$(dirname "$0")/.."

ACCOUNT="${1:?usage: deploy-testnet.sh <keystore-account-name>}"
RPC="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"

[ "$(cast chain-id --rpc-url "$RPC")" = "10143" ] || { echo "RPC is not Monad Testnet (10143)"; exit 1; }

forge build
# Monad charges the gas *limit*: keep forge's estimate multiplier modest (default is 130%).
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" \
  --account "$ACCOUNT" \
  --broadcast \
  --slow \
  --gas-estimate-multiplier 115

(cd ../web && node scripts/export-contracts.mjs)
echo "Done. Addresses exported to web/contracts/deployedContracts.ts (chain 10143)."
