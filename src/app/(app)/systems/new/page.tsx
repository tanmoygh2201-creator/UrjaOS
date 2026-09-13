import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SystemForm } from "@/components/systems/system-form";

export const metadata = { title: "New energy system" };

export default function NewSystemPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/systems"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to systems
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          New energy system
        </h1>
        <p className="mt-1 text-muted-foreground">
          Configure your solar array, battery, and tariff. You can change
          everything later.
        </p>
      </div>

      <SystemForm
        mode="create"
        defaults={{
          name: "",
          location: "",
          systemType: "residential",
          solarCapacityKw: "5",
          batteryCapacityKwh: "10",
          batteryMaxChargeKw: "3",
          batteryMaxDischargeKw: "3",
          minSoc: "10",
          maxSoc: "90",
          batteryChargeEfficiency: "0.95",
          batteryDischargeEfficiency: "0.95",
          tariffType: "flat",
          tariffRate: "8.5",
          currency: "INR",
          periods: [{ name: "day", startHour: "6", endHour: "22", rate: "8.5" }],
        }}
      />
    </div>
  );
}
