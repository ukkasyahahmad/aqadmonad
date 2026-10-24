"use client";

import { Maximize2, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

/** URL of the bidding page for an auction, on whatever host serves this app. */
const noopSubscribe = () => () => {};
export function useAuctionUrl(id: bigint, path?: string) {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => null);
  return origin ? `${origin}${path ?? `/auction/${id}`}` : null;
}

/** QR code (inline SVG) pointing phones straight at the auction's bid page. */
/** `path` overrides the target, e.g. "/live" for one QR that always follows the running lot. */
function useQrSvg(url: string | null) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#171A18", light: "#FFFFFF" } })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [url]);
  return svg;
}

export function AuctionQr({ id, className, caption = true, path }: { id: bigint; className?: string; caption?: boolean; path?: string }) {
  const url = useAuctionUrl(id, path);
  const svg = useQrSvg(url);
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

/**
 * Presentation mode: a full-screen white QR sized for scanning from across the room.
 * Enters the browser's fullscreen mode when allowed; Esc or ✕ closes it.
 */
export function QrFullscreenButton({
  id,
  path,
  title,
  subtitle = "Scan to bid · free test MON · no app needed",
  label = "Fullscreen QR",
  className,
}: {
  id: bigint;
  path?: string;
  title: string;
  subtitle?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border-strong bg-card px-4 text-sm font-semibold hover:bg-secondary",
          className,
        )}
      >
        <Maximize2 className="size-4" /> {label}
      </button>
      {open && createPortal(<QrOverlay id={id} path={path} title={title} subtitle={subtitle} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function QrOverlay({ id, path, title, subtitle, onClose }: { id: bigint; path?: string; title: string; subtitle: string; onClose: () => void }) {
  const url = useAuctionUrl(id, path);
  const svg = useQrSvg(url);
  const ref = useRef<HTMLDivElement>(null);
  // Parents re-render on every poll; keep the latest onClose without re-running the effect
  // (re-running would exit and re-enter fullscreen, which closes the overlay).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    el?.requestFullscreen?.().catch(() => {}); // falls back to a fixed overlay when not allowed
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    const onFs = () => !document.fullscreenElement && close.current();
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={`QR code: ${title}`} className="fixed inset-0 z-[100] flex overflow-y-auto bg-white p-[4vh] text-[#171A18]">
      <button onClick={onClose} aria-label="Close" className="fixed right-[3vh] top-[3vh] grid size-14 place-items-center rounded-full bg-[#F5F6F4] hover:bg-[#E4E8E4]">
        <X className="size-7" />
      </button>
      {/* m-auto: centred when it fits, scrollable when the screen is too short */}
      <div className="m-auto flex flex-col items-center gap-[3vh]">
        <div className="flex items-center gap-3">
          <LogoMark className="size-[6vh]" />
          <span className="text-[4vh] font-semibold tracking-tight">Aqad</span>
        </div>
        <div
          className="aspect-square w-[min(70vh,86vw)] [&>svg]:h-full [&>svg]:w-full"
          role="img"
          aria-label={`QR code for ${url ?? "auction"}`}
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <div className="text-center">
          <p className="text-[4.5vh] font-semibold leading-tight">{title}</p>
          <p className="text-[2.6vh] text-[#5B635F]">{subtitle}</p>
          {url && <p className="mt-[1vh] font-mono text-[2.4vh] font-semibold">{url.replace(/^https?:\/\//, "")}</p>}
        </div>
      </div>
    </div>
  );
}

/** Opens the current page inside the MetaMask mobile in-app browser (which injects a wallet). */
export function metamaskDeepLink(): string | null {
  if (typeof window === "undefined") return null;
  return `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
}
