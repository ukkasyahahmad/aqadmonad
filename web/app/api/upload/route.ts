import { put } from "@vercel/blob";

// Stores a listing photo in the public Vercel Blob store and returns its URL.
// The URL is then written into the NFT's on-chain metadata by the seller's own mint tx.
const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>(); // in-memory, per instance (demo-grade rate limit)

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Photo upload is not configured on this deployment." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return Response.json({ error: "Too many uploads. Try again in a minute." }, { status: 429 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "No file." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return Response.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 415 });
  if (file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ error: "Image must be under 4 MB." }, { status: 413 });
  }

  recent.push(now);
  hits.set(ip, recent);
  const blob = await put(`lots/photo.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return Response.json({ url: blob.url });
}
