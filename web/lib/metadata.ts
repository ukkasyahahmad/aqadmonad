// Token metadata is stored on-chain as a data: URI (see DemoNFT.mintWithURI).
// Photos live in Vercel Blob; only their URL is inside the on-chain JSON.

export type LotMetadata = {
  name: string;
  description?: string;
  image?: string;
  category?: string;
  condition?: string;
};

const MAX = { name: 80, description: 400, category: 40, condition: 40 };

export function encodeMetadata(m: LotMetadata): string {
  const clean: LotMetadata = {
    name: m.name.trim().slice(0, MAX.name),
    ...(m.description?.trim() && { description: m.description.trim().slice(0, MAX.description) }),
    ...(m.image && { image: m.image }),
    ...(m.category && { category: m.category.slice(0, MAX.category) }),
    ...(m.condition && { condition: m.condition.slice(0, MAX.condition) }),
  };
  const json = JSON.stringify(clean);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `data:application/json;base64,${b64}`;
}

/** Parses an on-chain tokenURI. Returns null for empty/unknown formats (never throws). */
export function decodeMetadata(uri?: string | null): LotMetadata | null {
  if (!uri) return null;
  try {
    const prefix = "data:application/json;base64,";
    if (!uri.startsWith(prefix)) return null;
    const bytes = Uint8Array.from(atob(uri.slice(prefix.length)), (c) => c.charCodeAt(0));
    const m = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof m?.name !== "string") return null;
    return {
      name: m.name,
      description: typeof m.description === "string" ? m.description : undefined,
      // Only show images served over https (or our own blob store).
      image: typeof m.image === "string" && m.image.startsWith("https://") ? m.image : undefined,
      category: typeof m.category === "string" ? m.category : undefined,
      condition: typeof m.condition === "string" ? m.condition : undefined,
    };
  } catch {
    return null;
  }
}
