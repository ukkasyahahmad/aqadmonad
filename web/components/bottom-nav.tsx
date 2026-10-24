"use client";

import { CircleUser, Compass, MonitorPlay, Tag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Explore", icon: Compass, match: (p: string) => p === "/" || p.startsWith("/auction") },
  { href: "/create", label: "Sell", icon: Tag, match: (p: string) => p.startsWith("/create") },
  { href: "/host", label: "Host", icon: MonitorPlay, match: (p: string) => p.startsWith("/host") },
  { href: "/account", label: "Account", icon: CircleUser, match: (p: string) => p.startsWith("/account") },
];

/** Mobile tab bar: icon + label, active tab highlighted, sits above the iOS home indicator. */
export function BottomNav() {
  // usePathname needs a Suspense boundary under Cache Components; the fallback is the same bar.
  return (
    <Suspense fallback={<Bar pathname={null} />}>
      <ActiveBar />
    </Suspense>
  );
}

function ActiveBar() {
  return <Bar pathname={usePathname()} />;
}

function Bar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = pathname !== null && match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-primary")}>
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
