import Link from "next/link";
import { ArrowRight, BatteryCharging, MapPin, Plus, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DemoSystemButton } from "@/components/systems/demo-system-button";
import { createClient } from "@/lib/supabase/server";
import { formatKwh, formatKw } from "@/lib/energy/format";
import { formatTariffSummary } from "@/lib/energy/tariff";
import type { EnergySystem } from "@/types/energy";

export const metadata = { title: "Energy systems" };

const TYPE_LABELS: Record<EnergySystem["system_type"], string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

function SystemCard({ system }: { system: EnergySystem }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">
            <Link
              href={`/systems/${system.id}`}
              className="underline-offset-4 hover:underline"
            >
              {system.name}
            </Link>
          </CardTitle>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {TYPE_LABELS[system.system_type]}
          </span>
        </div>
        <CardDescription className="flex items-center gap-1">
          {system.location ? (
            <>
              <MapPin className="size-3.5" aria-hidden="true" />
              {system.location}
            </>
          ) : (
            "No location set"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sun className="size-3.5 text-energy-amber" aria-hidden="true" />
              Solar
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {formatKw(system.solar_capacity_kw, 1)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BatteryCharging
                className="size-3.5 text-energy-green"
                aria-hidden="true"
              />
              Battery
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {formatKwh(system.battery_capacity_kwh, 1)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Tariff: {formatTariffSummary(system.electricity_tariff)}
        </p>
        <Button size="sm" variant="outline" asChild className="w-full">
          <Link href={`/systems/${system.id}`}>
            View details
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

interface SystemsPageProps {
  searchParams: Promise<{ deleted?: string }>;
}

export default async function SystemsPage({ searchParams }: SystemsPageProps) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Explicit owner filter: the user-facing list shows only the caller's own
  // systems (admins get a dedicated view later).
  const { data: systems } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const list = (systems ?? []) as EnergySystem[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Energy systems
          </h1>
          <p className="mt-1 text-muted-foreground">
            Solar, battery, and grid configurations you monitor with UrjaOS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DemoSystemButton
            scenario="factory-alpha-tou"
            label="Add TOU demo"
            variant="outline"
          />
          <Button asChild>
            <Link href="/systems/new">
              <Plus data-icon="inline-start" />
              New system
            </Link>
          </Button>
        </div>
      </div>

      {deleted ? (
        <div
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          System deleted.
        </div>
      ) : null}

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
              <Zap className="size-6 text-primary" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Create your first energy system to start monitoring your solar
                generation, consumption, and battery — all in one place.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/systems/new">
                  <Plus data-icon="inline-start" />
                  Create your first system
                </Link>
              </Button>
              <DemoSystemButton />
            </div>
            <p className="text-xs text-muted-foreground">
              The demo seeds “Factory Alpha” with 30 days of realistic data —
              perfect for exploring UrjaOS instantly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((system) => (
            <SystemCard key={system.id} system={system} />
          ))}
        </div>
      )}
    </div>
  );
}
