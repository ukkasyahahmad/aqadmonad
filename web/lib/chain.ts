import { createPublicClient, defineChain, fallback, http } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"], webSocket: ["wss://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

// A keyed RPC (NEXT_PUBLIC_RPC_URL) goes first; the public ones are the fallback chain.
const rpcUrls = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
].filter(Boolean) as string[];

export const httpTransport = fallback(rpcUrls.map((url) => http(url, { batch: true })));
export const wsUrl = "wss://testnet-rpc.monad.xyz";

// 200 ms polling: Monad blocks are ~400 ms, so receipts show up fast.
export const publicClient = createPublicClient({ chain: monadTestnet, transport: httpTransport, pollingInterval: 200 });

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: httpTransport },
  ssr: true,
});
