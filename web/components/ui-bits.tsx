import { cn } from "@/lib/utils";

export function NetworkPill({ dark }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-mono text-xs",
        dark ? "border-stage-line text-stage-text-2" : "border-line text-text-2",
      )}
    >
      <span className="size-1.5 rounded-full bg-accent" />
      Monad testnet
    </span>
  );
}

type Tone = "accent" | "amber" | "grey";
const tones: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-ink",
  amber: "bg-amber-soft text-amber-ink",
  grey: "bg-surface-2 text-text-2",
};
const dots: Record<Tone, string> = { accent: "bg-accent", amber: "bg-amber", grey: "bg-text-2" };

export function Chip({ tone = "accent", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium", tones[tone])}>
      <span className={cn("size-2 shrink-0 rounded-full", dots[tone])} />
      {children}
    </span>
  );
}

export function PrimaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex h-control w-full items-center justify-center rounded-xl bg-accent px-5 text-[17px] font-semibold text-white transition-opacity disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)} {...props} />;
}

export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
