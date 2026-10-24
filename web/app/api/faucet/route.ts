import { createPublicClient, getAddress, isAddress, parseEther } from "viem";
import { monadTestnet, monadTransport } from "@/lib/chain";

// Funds quick-bid wallets with test MON via the monskills faucet API
// (https://agents.devnads.com/v1/faucet — 1 MON per request on Monad Testnet).
// No private key is involved on our side. Limits are in-memory: fine for a one-day demo,
// NOT durable across serverless instances or redeploys.
const FAUCET_URL = "https://agents.devnads.com/v1/faucet";
const CAP = Number(process.env.DRIP_CAP ?? 60);
const MIN_BALANCE = parseEther("0.5");
const IP_WINDOW_MS = 60_000;
const IP_MAX = 3;

const funded = new Set<string>();
const ipHits = new Map<string, number[]>();
const client = createPublicClient({ chain: monadTestnet, transport: monadTransport });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const raw = (body as { address?: unknown })?.address;
  if (typeof raw !== "string" || !isAddress(raw)) {
    return Response.json({ error: "Invalid address." }, { status: 400 });
  }
  const address = getAddress(raw);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX) {
    return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }
  if (funded.has(address)) return Response.json({ error: "This wallet was already funded." }, { status: 409 });
  if (funded.size >= CAP) return Response.json({ error: "Demo faucet cap reached." }, { status: 429 });

  const balance = await client.getBalance({ address });
  if (balance >= MIN_BALANCE) {
    return Response.json({ error: "This wallet already has enough test MON." }, { status: 409 });
  }

  hits.push(now);
  ipHits.set(ip, hits);
  funded.add(address);
  try {
    const res = await fetch(FAUCET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId: monadTestnet.id, address }),
      signal: AbortSignal.timeout(25_000),
    });
    const data = (await res.json().catch(() => ({}))) as { txHash?: string; amount?: string; error?: string };
    if (!res.ok || !data.txHash) {
      funded.delete(address);
      return Response.json({ error: data.error ?? "Faucet unavailable. Use faucet.monad.xyz." }, { status: 502 });
    }
    return Response.json({ txHash: data.txHash, amount: data.amount });
  } catch {
    funded.delete(address);
    return Response.json({ error: "Faucet timed out. Use faucet.monad.xyz." }, { status: 504 });
  }
}
