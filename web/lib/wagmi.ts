import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet, monadTransport } from "./chain";

// Browser wallets (MetaMask etc.) via the injected connector. Only Monad Testnet is
// configured, so a wallet on any other chain is treated as "wrong network".
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: monadTransport },
  ssr: true,
});
