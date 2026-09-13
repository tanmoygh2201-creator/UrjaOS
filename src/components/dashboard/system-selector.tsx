"use client";

import { useRouter } from "next/navigation";

interface SystemSelectorProps {
  systems: { id: string; name: string }[];
  selectedId: string;
  /** Page path to navigate within; defaults to the dashboard. */
  basePath?: string;
  /** Extra query params (e.g. the analytics range) to preserve. */
  extraParams?: Record<string, string>;
}

/** Selects which energy system a page displays. */
export function SystemSelector({
  systems,
  selectedId,
  basePath = "/dashboard",
  extraParams,
}: SystemSelectorProps) {
  const router = useRouter();
  if (systems.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Select energy system</span>
      <select
        value={selectedId}
        onChange={(e) => {
          const params = new URLSearchParams({ system: e.target.value });
          for (const [key, value] of Object.entries(extraParams ?? {})) {
            params.set(key, value);
          }
          router.push(`${basePath}?${params.toString()}`);
        }}
        className="border-input bg-transparent flex h-9 rounded-lg border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Select energy system"
      >
        {systems.map((system) => (
          <option key={system.id} value={system.id}>
            {system.name}
          </option>
        ))}
      </select>
    </label>
  );
}
