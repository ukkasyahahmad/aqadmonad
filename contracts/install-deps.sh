#!/usr/bin/env sh
# Installs pinned Solidity deps into contracts/lib (not committed, see .gitignore).
set -e
cd "$(dirname "$0")"
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.4.0
forge install --no-git foundry-rs/forge-std@v1.17.0
