import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SystemForm } from "@/components/systems/system-form";
import { createClient } from "@/lib/supabase/server";
import type { EnergySystem } from "@/types/energy";

export const metadata = { title: "Edit energy system" };

interface EditSystemPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSystemPage({ params }: EditSystemPageProps) {
  const { id } = await params;
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

  const tariff =
    system.electricity_tariff.type === "flat"
      ? { type: "flat" as const, tariffRate: String(system.electricity_tariff.rate) }
      : { type: "tou" as const, tariffRate: "" };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/systems/${system.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {system.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Edit {system.name}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Changes apply to future monitoring, forecasts, and optimizations.
        </p>
      </div>

      <SystemForm
        mode="edit"
        defaults={{
          id: system.id,
          name: system.name,
          location: system.location ?? "",
          systemType: system.system_type,
          solarCapacityKw: String(system.solar_capacity_kw),
          batteryCapacityKwh: String(system.battery_capacity_kwh),
          batteryMaxChargeKw: String(system.battery_max_charge_kw),
          batteryMaxDischargeKw: String(system.battery_max_discharge_kw),
          minSoc: String(system.min_soc),
          maxSoc: String(system.max_soc),
          batteryChargeEfficiency: String(system.battery_charge_efficiency),
          batteryDischargeEfficiency: String(system.battery_discharge_efficiency),
          tariffType: tariff.type,
          tariffRate: tariff.tariffRate,
          currency: system.currency,
          periods:
            system.electricity_tariff.type === "tou"
              ? system.electricity_tariff.periods.map((p) => ({
                  name: p.name,
                  startHour: String(p.startHour),
                  endHour: String(p.endHour),
                  rate: String(p.rate),
                }))
              : [{ name: "day", startHour: "6", endHour: "22", rate: "8.5" }],
        }}
      />
    </div>
  );
}
