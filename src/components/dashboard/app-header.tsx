"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/forecasting", label: "Forecasting" },
  { href: "/battery", label: "Battery" },
  { href: "/copilot", label: "AI Copilot" },
  { href: "/reports", label: "Reports" },
  { href: "/alerts", label: "Alerts" },
] as const;

interface AppHeaderProps {
  userLabel: string;
}

export function AppHeader({ userLabel }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-4.5" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              Urja<span className="text-primary">OS</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="hidden max-w-[180px] truncate rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block"
            title="Settings"
          >
            {userLabel}
          </Link>
          <LogoutButton />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-border/60 bg-background lg:hidden"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-2 sm:px-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive(link.href)
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Settings
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
