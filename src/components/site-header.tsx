"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/analyze", label: "Check a prep", short: "Check" },
  { href: "/parameters", label: "Ranges", short: "Ranges" },
  { href: "/method", label: "Method", short: "Method" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-none">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" data-testid="home-link">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
              <path d="M8 23.5L12.2 11.5H19.8L24 23.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M6.5 23.5H25.5" stroke="#E3C27A" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <span className="block font-heading text-[15px] leading-none tracking-tight">Finish Line</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Crown prep check
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary sm:px-3",
                  active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="sm:hidden">{link.short}</span>
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
