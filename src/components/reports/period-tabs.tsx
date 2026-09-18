"use client";

import Link from "next/link";
import { REPORT_PERIODS, type ReportPeriodKey } from "@/lib/energy/report-service";

interface PeriodTabsProps {
  selected: ReportPeriodKey;
  systemId: string | null;
}

/** Daily / Weekly / Monthly switcher. Preserves the system param. */
export function PeriodTabs({ selected, systemId }: PeriodTabsProps) {
  const hrefFor = (key: ReportPeriodKey) => {
    const params = new URLSearchParams({ period: key });
    if (systemId) params.set("system", systemId);
    return `/reports?${params.toString()}`;
  };

  return (
    <div
      role="tablist"
      aria-label="Report period"
      className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5"
    >
      {REPORT_PERIODS.map((period) => {
        const isActive = period.key === selected;
        return (
          <Link
            key={period.key}
            href={hrefFor(period.key)}
            role="tab"
            aria-selected={isActive}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`}
          >
            {period.label}
          </Link>
        );
      })}
    </div>
  );
}
