"use client";

import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** URL of the bidding page for an auction, on whatever host serves this app. */
const noopSubscribe = () => () => {};
export function useAuctionUrl(id: bigint, path?: string) {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => null);
  return origin ? `${origin}${path ?? `/auction/${id}`}` : null;
}

/** QR code (inline SVG) pointing phones straight at the auction's bid page. */
/** `path` overrides the target, e.g. "/live" for one QR that always follows the running lot. */
export function AuctionQr({ id, className, caption = true, path }: { id: bigint; className?: string; caption?: boolean; path?: string }) {
  const url = useAuctionUrl(id, path);
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#171A18", light: "#FFFFFF" } })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [url]);
  return (
    <figure className={cn("space-y-2", className)}>
      <div
        className="aspect-square w-full rounded-2xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
        role="img"
        aria-label={`QR code for ${url ?? "auction page"}`}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      {caption && url && <figcaption className="break-all text-center font-mono text-xs text-muted-foreground">{url.replace(/^https?:\/\//, "")}</figcaption>}
    </figure>
  );
}

/** Opens the current page inside the MetaMask mobile in-app browser (which injects a wallet). */
export function metamaskDeepLink(): string | null {
  if (typeof window === "undefined") return null;
  return `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
}
