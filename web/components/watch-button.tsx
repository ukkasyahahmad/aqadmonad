"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useWatchlist } from "@/hooks/use-watchlist";
import { cn } from "@/lib/utils";
import { useMounted } from "./wallet";

export function WatchButton({ id, full, className }: { id: bigint; full?: boolean; className?: string }) {
  const mounted = useMounted();
  const { has, toggle } = useWatchlist();
  const on = mounted && has(id);
  const Icon = on ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className={cn(
        full
          ? "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-card text-sm font-semibold"
          : "grid size-11 place-items-center rounded-full bg-card/90 shadow-sm",
        className,
      )}
    >
      {full && (on ? "On your watchlist" : "Add to watchlist")}
      <Icon className="size-4" />
    </button>
  );
}
