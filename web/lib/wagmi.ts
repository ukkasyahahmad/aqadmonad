import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet, transport } from "./chain";

// MetaMask via the injected connector only; burner wallets are handled separately with viem.
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: transport },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
