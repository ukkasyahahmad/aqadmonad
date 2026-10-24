import { fallback, http } from "viem";
import { monadTestnet as viemMonadTestnet } from "viem/chains";

// The app runs on Monad Testnet only (chain 10143).
// Explorer and RPCs from docs.monad.xyz/developer-essentials/testnets.
export const monadTestnet = {
  ...viemMonadTestnet,
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
} as const;

export const targetChain = monadTestnet;

export const explorerTx = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${monadTestnet.blockExplorers.default.url}/address/${addr}`;

/** Official Monad Testnet WebSocket endpoint (eth_subscribe / monadLogs). */
export const MONAD_WSS = "wss://testnet-rpc.monad.xyz";

// NEXT_PUBLIC_RPC_URL (if set) is tried first; viem falls back to the next official
// endpoint on errors or rate limits.
const MONAD_RPCS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
].filter((u): u is string => Boolean(u));

export const monadTransport = fallback(
  MONAD_RPCS.map((url) => http(url, { retryCount: 2, retryDelay: 400 })),
);

/** Public eth_getLogs on Monad Testnet is limited to a 100-block range. */
export const LOG_RANGE = 100n;
