// Stages a live demo auction on Monad Testnet without touching anyone's real keys:
// a throwaway key is generated in memory (never printed or saved), funded with 1 test MON
// from the MONSKILLS faucet, then mints a DemoNFT with metadata, approves and lists it.
// Usage: node scripts/seed-auction.mjs [minutes=3] [name="Leica M6 rangefinder kit"]
import { createPublicClient, createWalletClient, http, parseEther, parseEventLogs } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { AuctionHouseAbi, DemoNFTAbi } from "../contracts/abis.ts";
import deployed from "../contracts/deployedContracts.ts";

const minutes = Number(process.argv[2] ?? 3);
const name = process.argv[3] ?? "Leica M6 rangefinder kit";
const d = deployed["10143"];
if (!d) throw new Error("No Monad Testnet deployment in deployedContracts.ts");

const transport = http("https://testnet-rpc.monad.xyz");
const pub = createPublicClient({ chain: monadTestnet, transport });
const account = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account, chain: monadTestnet, transport });

const res = await fetch("https://agents.devnads.com/v1/faucet", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chainId: 10143, address: account.address }),
});
const drip = await res.json();
if (!drip.txHash) throw new Error(`Faucet failed: ${JSON.stringify(drip)}`);
await pub.waitForTransactionReceipt({ hash: drip.txHash });
await new Promise((r) => setTimeout(r, 1500)); // Monad: new funds usable after ~3 blocks

const meta = {
  name,
  description: "Staged demo lot for the Aqad live auction at Monad Blitz Jogja.",
  category: "Electronics",
  condition: "Used — excellent",
};
const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const send = async (args, retries = 2) => {
  try {
    const gas = await pub.estimateContractGas({ ...args, account });
    const r = await wallet.writeContractSync({ ...args, gas: gas + gas / 10n });
    if (r.status !== "success") throw new Error(`${args.functionName} reverted`);
    await sleep(1500); // reserve-balance pacing for a <10 MON sender
    return r;
  } catch (e) {
    // The RPC can briefly lag the previous receipt; wait a few blocks and retry.
    if (retries === 0) throw e;
    await sleep(2000);
    return send(args, retries - 1);
  }
};

const mint = await send({ address: d.DemoNFT.address, abi: DemoNFTAbi, functionName: "mintWithURI", args: [account.address, uri] });
const [t] = parseEventLogs({ abi: DemoNFTAbi, eventName: "Transfer", logs: mint.logs });
await send({ address: d.DemoNFT.address, abi: DemoNFTAbi, functionName: "approve", args: [d.AuctionHouse.address, t.args.tokenId] });
const created = await send({
  address: d.AuctionHouse.address,
  abi: AuctionHouseAbi,
  functionName: "createAuction",
  args: [d.DemoNFT.address, t.args.tokenId, parseEther("0.01"), BigInt(minutes * 60)],
});
const [ev] = parseEventLogs({ abi: AuctionHouseAbi, eventName: "AuctionCreated", logs: created.logs });
console.log(`Auction #${ev.args.id} live for ${minutes} min (token #${t.args.tokenId}, start 0.01 MON)`);
console.log(`  bid:    https://aqadmonad.vercel.app/auction/${ev.args.id}`);
console.log(`  screen: https://aqadmonad.vercel.app/screen/${ev.args.id}`);
console.log(`  tx:     https://testnet.monadvision.com/tx/${created.transactionHash}`);
