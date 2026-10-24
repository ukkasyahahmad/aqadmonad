import { createConfig } from "wagmi";
import { foundry } from "viem/chains";
import { injected } from "wagmi/connectors";
import { localTransport, monadTestnet, monadTransport, targetChain } from "./chain";

// Browser wallets (MetaMask etc.) via the injected connector. Only the target chain is
// configured, so a wallet on any other chain is treated as "wrong network".
export const wagmiConfig =
  targetChain.id === foundry.id
    ? createConfig({
        chains: [foundry],
        connectors: [injected()],
        transports: { [foundry.id]: localTransport },
        ssr: true,
      })
    : createConfig({
        chains: [monadTestnet],
        connectors: [injected()],
        transports: { [monadTestnet.id]: monadTransport },
        ssr: true,
      });
