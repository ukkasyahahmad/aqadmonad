import { createWalletClient, isAddress, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { httpTransport, monadTestnet, publicClient } from "@/lib/chain";
import { dripDecision } from "@/lib/drip";

// Node runtime is the default for route handlers (needed for the in-memory state below).

// In-memory state is enough for a one-day demo (resets on cold start; the on-chain
// balance check still stops repeat drips to a funded phone).
const dripped = new Set<string>();
let count = 0;
const ipHits = new Map<string, number[]>();
// One send at a time so concurrent requests never reuse the funder's nonce.
let queue: Promise<unknown> = Promise.resolve();

function hitsFor(ip: string) {
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  ipHits.set(ip, recent);
  return recent.length;
}

export async function POST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address, { strict: false })) {
    return Response.json({ ok: false, reason: "bad-address" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const balanceWei = await publicClient.getBalance({ address: address as Address });
  const decision = dripDecision({
    address,
    balanceWei,
    dripped,
    count,
    cap: Number(process.env.DRIP_CAP ?? 60),
    ipHits: hitsFor(ip),
  });

  if (decision === "already" || decision === "skip-funded") return Response.json({ ok: true, skipped: true });
  if (decision === "cap" || decision === "rate") return Response.json({ ok: false, reason: decision }, { status: 429 });
  if (decision === "bad-address") return Response.json({ ok: false, reason: decision }, { status: 400 });

  const key = process.env.FUNDER_PRIVATE_KEY as Hex | undefined;
  if (!key) return Response.json({ ok: false, reason: "not-configured" }, { status: 500 });

  // Claim the address before awaiting, so a double tap can't drip twice.
  dripped.add(address.toLowerCase());
  count++;
  const send = async () => {
    const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: httpTransport });
    const hash = await wallet.sendTransaction({ to: address as Address, value: parseEther("1"), gas: 21_000n });
    await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
    return hash;
  };
  const job = queue.then(send);
  queue = job.catch(() => {});

  try {
    const hash = await job;
    return Response.json({ ok: true, hash });
  } catch {
    dripped.delete(address.toLowerCase());
    count--;
    return Response.json({ ok: false, reason: "send-failed" }, { status: 502 });
  }
}
