"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { CreditsPill } from "@/components/shell/CreditsPill";

const LINKS = [
  { href: "/", label: "Explore" },
  { href: "/create", label: "Create" },
  { href: "/campaigns", label: "Campaigns", badge: "New" },
  { href: "/library", label: "Library" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          Hookline
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
                {link.badge ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                    {link.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0">
          <CreditsPill />
        </div>
      </div>
    </header>
  );
}
