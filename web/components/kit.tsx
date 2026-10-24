import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  Hourglass,
  Loader2,
  Radio,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { explorerTx } from "@/lib/chain";

export function Card({ className, ...p }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-3xl border border-border bg-card p-5 shadow-[0_1px_2px_#1018140A] sm:p-6", className)}
      {...p}
    />
  );
}

export function Eyebrow({ className, ...p }: ComponentProps<"p">) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", className)} {...p} />;
}

type Tone = "success" | "warning" | "neutral" | "danger" | "dark";
const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-secondary text-muted-foreground",
  danger: "bg-destructive-soft text-destructive",
  dark: "bg-foreground text-background",
};

export function Pill({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Status from on-chain state only. "Awaiting settlement" = expired but endAuction not yet called. */
export type LotState = "live" | "ending" | "awaiting" | "settled" | "cancelled";

export function lotState(status: string, endTime: bigint, now: number | null): LotState {
  if (status === "Ended") return "settled";
  if (status === "Cancelled") return "cancelled";
  if (now === null) return "live";
  const left = Number(endTime) - now;
  if (left <= 0) return "awaiting";
  return left < 60 ? "ending" : "live";
}

export function StatePill({ state }: { state: LotState }) {
  switch (state) {
    case "live":
      return <Pill tone="success" icon={<Radio className="size-3.5" />}>Live</Pill>;
    case "ending":
      return <Pill tone="warning" icon={<Clock className="size-3.5" />}>Ending soon</Pill>;
    case "awaiting":
      return <Pill tone="warning" icon={<Hourglass className="size-3.5" />}>Awaiting settlement</Pill>;
    case "settled":
      return <Pill tone="dark" icon={<CheckCircle2 className="size-3.5" />}>Settled</Pill>;
    case "cancelled":
      return <Pill tone="neutral" icon={<Ban className="size-3.5" />}>Cancelled</Pill>;
  }
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-foreground px-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide">
      <FlaskConical className="size-3" />
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", title, children }: { tone?: "neutral" | "warning" | "danger" | "success"; title?: string; children?: ReactNode }) {
  const cls = {
    neutral: "bg-accent text-foreground",
    warning: "bg-warning-soft text-warning",
    danger: "bg-destructive-soft text-destructive",
    success: "bg-success-soft text-success",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl p-4 text-sm", cls)}>
      {tone === "success" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", tone === "neutral" && "hidden")} />
      )}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function TxLink({ hash, label = "View transaction" }: { hash: string; label?: string }) {
  const url = explorerTx(hash);
  if (!url) return <span className="font-mono text-xs">{hash.slice(0, 10)}…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
      {label} <ExternalLink className="size-3.5" />
    </a>
  );
}

const btn = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border-strong bg-card text-foreground hover:bg-secondary",
  dark: "bg-foreground text-background hover:bg-foreground/90",
  ghost: "text-foreground hover:bg-secondary",
};

export function Btn({
  variant = "primary",
  size = "lg",
  loading,
  className,
  children,
  ...p
}: ComponentProps<"button"> & { variant?: keyof typeof btn; size?: "md" | "lg"; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-subtle-foreground disabled:border-transparent",
        size === "lg" ? "h-[52px] px-5 text-[15px]" : "h-11 px-4 text-sm",
        btn[variant],
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="block text-xs font-medium text-destructive">{error}</span> : hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputCls = (error?: boolean) =>
  cn(
    "h-[52px] w-full rounded-xl border bg-card px-4 text-[15px] outline-none placeholder:text-subtle-foreground focus:border-2 focus:border-foreground",
    error ? "border-2 border-destructive" : "border-border-strong",
  );
