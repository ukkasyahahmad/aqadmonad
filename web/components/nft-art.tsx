/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

// Deterministic generated artwork for tokens without a photo: concentric wobbly rings
// on a dark field, matching the html-design media style.
function rings(seed: number) {
  const paths: string[] = [];
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const n = 7 + (seed % 5);
  for (let r = 0; r < n; r++) {
    const radius = 34 + r * 4.2;
    const pts: string[] = [];
    const wob = 1.5 + rnd() * 4;
    const freq = 3 + Math.floor(rnd() * 5);
    const phase = rnd() * Math.PI * 2;
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      const rr = radius + Math.sin(t * freq + phase) * wob;
      pts.push(`${(100 + Math.cos(t) * rr).toFixed(1)},${(100 + Math.sin(t) * rr).toFixed(1)}`);
    }
    paths.push(pts.join(" "));
  }
  return paths;
}

export function NftArt({
  tokenId,
  image,
  alt,
  className,
}: {
  tokenId: bigint;
  image?: string;
  alt: string;
  className?: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={alt}
        className={cn("aspect-square w-full rounded-2xl bg-[#101311] object-cover", className)}
      />
    );
  }
  const seed = Number(tokenId % 997n) + 1;
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={alt}
      className={cn("aspect-square w-full rounded-2xl bg-[#101311]", className)}
    >
      {rings(seed).map((p, i) => (
        <polyline
          key={i}
          points={p}
          fill="none"
          stroke={i % 2 ? "#E4ED72" : "#DFE7E1"}
          strokeOpacity={0.25 + (i / 12)}
          strokeWidth={0.8}
        />
      ))}
    </svg>
  );
}
