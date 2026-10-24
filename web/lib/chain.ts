import { fallback, http } from "viem";
import { foundry, monadTestnet as viemMonadTestnet } from "viem/chains";

// Monad Testnet (chain 10143). Explorer from docs.monad.xyz/developer-essentials/testnets.
export const monadTestnet = {
  ...viemMonadTestnet,
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
} as const;

// Which chain the app targets. Vercel uses the default (Monad Testnet);
// set NEXT_PUBLIC_CHAIN_ID=31337 in web/.env.local for the local anvil chain.
export const targetChain =
  process.env.NEXT_PUBLIC_CHAIN_ID === String(foundry.id) ? foundry : monadTestnet;

export const isLocal = targetChain.id === foundry.id;

export const explorerTx = (hash: string) =>
  isLocal ? null : `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) =>
  isLocal ? null : `${monadTestnet.blockExplorers.default.url}/address/${addr}`;

// Public RPCs from docs.monad.xyz. NEXT_PUBLIC_RPC_URL (if set) is tried first;
// viem falls back to the next URL on errors or rate limits.
const MONAD_RPCS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
].filter((u): u is string => Boolean(u));

export const monadTransport = fallback(
  MONAD_RPCS.map((url) => http(url, { retryCount: 2, retryDelay: 400 })),
);
export const localTransport = http("http://127.0.0.1:8545");

/** Public eth_getLogs on Monad Testnet is limited to a 100-block range. */
export const LOG_RANGE = 100n;
