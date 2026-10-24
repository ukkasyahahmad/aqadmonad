import { fallback, http } from "viem";
import { monadTestnet as viemMonadTestnet } from "viem/chains";

// Monad Testnet (chain 10143). Explorer overridden to MonadVision per project brief.
export const monadTestnet = {
  ...viemMonadTestnet,
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
} as const;

export const explorerTx = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) =>
  `${monadTestnet.blockExplorers.default.url}/address/${addr}`;

// Public RPCs from docs.monad.xyz/developer-essentials/testnets.
// NEXT_PUBLIC_RPC_URL (if set) is tried first; viem falls back on errors / rate limits.
const RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
].filter((u): u is string => Boolean(u));

export const transport = fallback(
  RPC_URLS.map((url) => http(url, { batch: true, retryCount: 2, retryDelay: 300 })),
  { rank: false },
);
