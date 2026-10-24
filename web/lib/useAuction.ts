"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAbi, zeroAddress, type Address } from "viem";
import { monadTestnet, publicClient } from "./chain";
import { AUCTION_ADDRESS, auctionAbi } from "./contracts";

export type Auction = {
  seller: Address;
  nft: Address;
  tokenId: bigint;
  reserve: bigint;
  minStep: bigint;
  endsAt: number;
  buffer: number;
  topBidder: Address;
  topBid: bigint;
  settled: boolean;
};

export type AuctionState = {
  auction?: Auction;
  minNext?: bigint;
  balance?: bigint;
  blockTs?: number;
  fetchedAt?: number;
};

const multicall3 = monadTestnet.contracts.multicall3.address;
const mc3Abi = parseAbi([
  "function getEthBalance(address) view returns (uint256)",
  "function getCurrentBlockTimestamp() view returns (uint256)",
]);

/**
 * Everything a page needs about one auction, in ONE multicall per second
 * (keeps 30 phones well under the RPC rate limits).
 */
export function useAuction(id: bigint, me?: Address) {
  const [state, setState] = useState<AuctionState>({});
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [a, minNext, balance, ts] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "auctions", args: [id] },
          { address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "minNextBid", args: [id] },
          { address: multicall3, abi: mc3Abi, functionName: "getEthBalance", args: [me ?? zeroAddress] },
          { address: multicall3, abi: mc3Abi, functionName: "getCurrentBlockTimestamp" },
        ],
      });
      const [seller, nft, tokenId, reserve, minStep, endsAt, buffer, topBidder, topBid, settled] = a;
      setState({
        auction: { seller, nft, tokenId, reserve, minStep, endsAt: Number(endsAt), buffer, topBidder, topBid, settled },
        minNext,
        balance: me ? balance : undefined,
        blockTs: Number(ts),
        fetchedAt: performance.now(),
      });
    } catch {
      // Network blip or rate limit: keep the last good state, the next tick retries.
    } finally {
      busy.current = false;
    }
  }, [id, me]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...state, refresh };
}

/** Re-render every `ms` so countdowns tick between polls. */
export function useNow(ms = 200) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
