import { cn } from "@/lib/utils";

/** Brand mark: two interlocking rings (seller + bidder) on the dark tile. Source: docs/logo/logo.svg */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn("size-[30px] shrink-0", className)}>
      <rect width="48" height="48" rx="12" fill="#171A18" />
      <g fill="none" strokeWidth="5">
        <circle cx="18" cy="24" r="10" stroke="#EEF0ED" />
        <circle cx="30" cy="24" r="10" stroke="#E4ED72" />
        <path d="M20.59 14.34A10 10 0 0 1 26.66 19" stroke="#171A18" strokeWidth="9" />
        <path d="M20.59 14.34A10 10 0 0 1 26.66 19" stroke="#EEF0ED" />
        <path d="M27.41 33.66A10 10 0 0 1 21.34 29" stroke="#171A18" strokeWidth="9" />
        <path d="M27.41 33.66A10 10 0 0 1 21.34 29" stroke="#E4ED72" />
      </g>
    </svg>
  );
}
