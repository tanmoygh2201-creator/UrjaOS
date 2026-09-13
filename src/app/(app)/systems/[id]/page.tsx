import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BatteryCharging,
  Coins,
  Gauge,
  Pencil,
  Settings2,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeleteSystemButton } from "@/components/systems/delete-system-button";
import { createClient } from "@/lib/supabase/server";
import {
  formatKwh,
  formatKw,
  formatPercent,
} from "@/lib/energy/format";
import { formatTariffSummary } from "@/lib/energy/tariff";
import type { EnergySystem } from "@/types/energy";

export const metadata = { title: "Energy system" };

const TYPE_LABELS: Record<EnergySystem["system_type"], string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

interface SystemDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function SystemDetailPage({
  params,
  searchParams,
}: SystemDetailPageProps) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!data) notFound();
  const system = data as EnergySystem;

  const configRows: { label: string; value: string; icon: typeof Sun }[] = [
    { label: "Solar capacity", value: formatKw(system.solar_capacity_kw, 1), icon: Sun },
    {
      label: "Battery capacity",
      value: formatKwh(system.battery_capacity_kwh, 1),
      icon: BatteryCharging,
    },
    {
      label: "Max charge / discharge",
      value: `${formatKw(system.battery_max_charge_kw, 1)} / ${formatKw(
        system.battery_max_discharge_kw,
        1
      )}`,
      icon: Gauge,
    },
    {
      label: "SOC window",
      value: `${formatPercent(system.min_soc)} – ${formatPercent(system.max_soc)}`,
      icon: Settings2,
    },
    {
      label: "Round-trip efficiency",
      value: formatPercent(
        system.battery_charge_efficiency * system.battery_discharge_efficiency * 100,
        1
      ),
      icon: Settings2,
    },
    {
      label: "Tariff",
      value: formatTariffSummary(system.electricity_tariff),
      icon: Coins,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/systems"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to systems
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {system.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {TYPE_LABELS[system.system_type]}
              {system.location ? ` · ${system.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/systems/${system.id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
            <DeleteSystemButton systemId={system.id} systemName={system.name} />
          </div>
        </div>
      </div>

      {error === "delete_failed" ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not delete this system. Please try again.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>
            These limits constrain the battery optimizer and all cost
            calculations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {configRows.map((row) => (
              <div
                key={row.label}
                className="flex items-start gap-3 rounded-lg border border-border px-4 py-3"
              >
                <row.icon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {row.value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monitoring data</CardTitle>
          <CardDescription>
            Live readings, analytics, forecasts, and optimization arrive in the
            next phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once the simulator runs (Phase 6), this system will start collecting
            solar, consumption, battery, and grid data automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
