"use client";

import { createWalletClient, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { httpTransport, monadTestnet } from "./chain";

const KEY = "aqad.burner";

/** The phone's in-page wallet. Created once, kept in localStorage, reused on reload. Testnet only. */
export function getBurner() {
  let pk = localStorage.getItem(KEY) as Hex | null;
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(KEY, pk);
  }
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: httpTransport });
  return { address: account.address, account, walletClient };
}
