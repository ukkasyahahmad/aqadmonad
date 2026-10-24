"use client";

import { createWalletClient, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { isLocal, localTransport, monadTransport, targetChain } from "./chain";

// Quick-bid wallet: a throwaway key generated in this browser and kept in localStorage so a
// reload keeps the same wallet. It is NOT secure custody — test MON only. The key never leaves
// the browser (it is not sent to our server and never logged).
export const BURNER_KEY = "live-auction.burner.v1";
const KEY = BURNER_KEY;

export function loadBurner(): PrivateKeyAccount | null {
  try {
    const k = localStorage.getItem(KEY) as Hex | null;
    return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? privateKeyToAccount(k) : null;
  } catch {
    return null;
  }
}

export function createBurner(): PrivateKeyAccount {
  const k = generatePrivateKey();
  localStorage.setItem(KEY, k);
  return privateKeyToAccount(k);
}

/** Wallet client signing locally, so writes can use eth_sendRawTransactionSync. */
export function burnerClient(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain: targetChain, transport: isLocal ? localTransport : monadTransport });
}

// Stable, human nickname derived from the address (no identity data stored).
const WORDS = ["Gudeg", "Bakpia", "Malioboro", "Tugu", "Kraton", "Merapi", "Prambanan", "Wedang", "Angkringan", "Kotagede", "Sate", "Bakmi"];
export function nickname(address: string): string {
  const n = parseInt(address.slice(2, 10), 16);
  return `${WORDS[n % WORDS.length]}-${String(n % 100).padStart(2, "0")}`;
}
