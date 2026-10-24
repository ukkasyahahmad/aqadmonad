"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { burnerClient } from "@/lib/burner";

const INTERVAL_MS = 15_000;
const MAX_SAMPLES = 20;

/**
 * Live Monad confirmation-time probe: every 15 s the screen's own quick-bid wallet sends a
 * 0-MON self-transfer (gas 21,000) with eth_sendRawTransactionSync and times send → receipt.
 * Real transactions, real measurements; costs ~0.002 MON per probe on testnet.
 */
export function useSpeedProbe(account: PrivateKeyAccount | null, enabled: boolean) {
  const [samples, setSamples] = useState<{ ms: number; block: bigint; hash: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const probe = useCallback(async () => {
    if (!account || busy.current) return;
    busy.current = true;
    try {
      const t0 = performance.now();
      const r = await burnerClient(account).sendTransactionSync({ to: account.address, value: 0n, gas: 21_000n });
      const ms = Math.round(performance.now() - t0);
      setSamples((s) => [{ ms, block: r.blockNumber, hash: r.transactionHash }, ...s].slice(0, MAX_SAMPLES));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && /insufficient/i.test(e.message) ? "Probe wallet needs test MON." : "Probe failed; retrying.");
    } finally {
      busy.current = false;
    }
  }, [account]);

  useEffect(() => {
    if (!enabled || !account) return;
    const first = setTimeout(probe, 1500); // newly funded wallets wait ~3 blocks (reserve balance)
    const t = setInterval(probe, INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [enabled, account, probe]);

  const avg = samples.length ? Math.round(samples.reduce((a, s) => a + s.ms, 0) / samples.length) : null;
  return { samples, last: samples[0] ?? null, avg, error, probe };
}
