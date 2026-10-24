import { AuctionHouseAbi, DemoNFTAbi } from "@/contracts/abis";
import deployedContracts from "@/contracts/deployedContracts";
import { targetChain } from "./chain";

// Addresses come from the generated deployedContracts.ts (keyed by chain ID); ABIs come
// from the compiled Foundry artifacts. Nothing is hard-coded in components.
const deployment = deployedContracts[String(targetChain.id)];

export const auctionHouse = deployment ? { address: deployment.AuctionHouse.address, abi: AuctionHouseAbi } : null;
export const demoNft = deployment ? { address: deployment.DemoNFT.address, abi: DemoNFTAbi } : null;

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
