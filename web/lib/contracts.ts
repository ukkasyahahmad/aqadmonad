import deployedContracts from "@/contracts/deployedContracts";
import { targetChain } from "./chain";

type Deployments = typeof deployedContracts;
type ChainKey = keyof Deployments;

// Addresses and ABIs come from the generated deployedContracts.ts, keyed by chain ID,
// so a local deployment can never be used on Monad Testnet (or vice versa).
const byChain = (deployedContracts as Record<string, Deployments[ChainKey]>)[String(targetChain.id)];

export const contracts = byChain ?? null;
export const auctionHouse = byChain?.AuctionHouse ?? null;
export const demoNft = byChain?.DemoNFT ?? null;

export type AuctionHouseAbi = Deployments[ChainKey]["AuctionHouse"]["abi"];
export type DemoNftAbi = Deployments[ChainKey]["DemoNFT"]["abi"];

export const STATUS = ["Active", "Ended", "Cancelled"] as const;
export type StatusName = (typeof STATUS)[number];

export type Auction = {
  id: bigint;
  seller: `0x${string}`;
  nft: `0x${string}`;
  tokenId: bigint;
  minPrice: bigint;
  highestBid: bigint;
  highestBidder: `0x${string}`;
  endTime: bigint;
  status: StatusName;
};

export const ZERO = "0x0000000000000000000000000000000000000000";

/** Same rule as AuctionHouse._minNextBid: minPrice, else highestBid + ceil(5%). */
export function minNextBid(a: Pick<Auction, "minPrice" | "highestBid">): bigint {
  if (a.highestBid === 0n) return a.minPrice;
  return a.highestBid + (a.highestBid * 500n + 9_999n) / 10_000n;
}

export function toAuction(
  id: bigint,
  r: readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, `0x${string}`, bigint, number],
): Auction {
  return {
    id,
    seller: r[0],
    nft: r[1],
    tokenId: r[2],
    minPrice: r[3],
    highestBid: r[4],
    highestBidder: r[5],
    endTime: r[6],
    status: STATUS[r[7]] ?? "Active",
  };
}
