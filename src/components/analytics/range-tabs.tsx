"use client";

import Link from "next/link";
import { ANALYTICS_RANGES, type AnalyticsRangeKey } from "@/lib/energy/analytics-service";

interface RangeTabsProps {
  selected: AnalyticsRangeKey;
  systemId: string | null;
}

/** Range switcher (spec §29: Today → 1 Year). Preserves the system param. */
export function RangeTabs({ selected, systemId }: RangeTabsProps) {
  const hrefFor = (key: AnalyticsRangeKey) => {
    const params = new URLSearchParams({ range: key });
    if (systemId) params.set("system", systemId);
    return `/analytics?${params.toString()}`;
  };

  return (
    <div
      role="tablist"
      aria-label="Analytics date range"
      className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5"
    >
      {ANALYTICS_RANGES.map((range) => {
        const isActive = range.key === selected;
        return (
          <Link
            key={range.key}
            href={hrefFor(range.key)}
            role="tab"
            aria-selected={isActive}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`}
          >
            {range.label}
          </Link>
        );
      })}
    </div>
  );
}
