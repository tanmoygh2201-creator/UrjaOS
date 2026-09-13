"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createSystemAction,
  updateSystemAction,
  type SystemFormState,
} from "@/app/actions/systems";

export interface SystemFormDefaults {
  id?: string;
  name: string;
  location: string;
  systemType: "residential" | "commercial" | "industrial";
  solarCapacityKw: string;
  batteryCapacityKwh: string;
  batteryMaxChargeKw: string;
  batteryMaxDischargeKw: string;
  minSoc: string;
  maxSoc: string;
  batteryChargeEfficiency: string;
  batteryDischargeEfficiency: string;
  tariffType: "flat" | "tou";
  tariffRate: string;
  currency: string;
  periods: { name: string; startHour: string; endHour: string; rate: string }[];
}

interface SystemFormProps {
  mode: "create" | "edit";
  defaults: SystemFormDefaults;
}

const EMPTY_PERIOD = { name: "", startHour: "0", endHour: "6", rate: "5" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

const SELECT_CLASS =
  "border-input bg-transparent flex h-8 w-full rounded-lg border px-2.5 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SystemForm({ mode, defaults }: SystemFormProps) {
  const [state, formAction, isPending] = useActionState(
    mode === "create" ? createSystemAction : updateSystemAction,
    {} satisfies SystemFormState
  );

  const [tariffType, setTariffType] = useState<"flat" | "tou">(
    defaults.tariffType
  );
  const [periods, setPeriods] = useState(defaults.periods);

  const updatePeriod = (
    index: number,
    patch: Partial<(typeof periods)[number]>
  ) =>
    setPeriods((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
    );

  const fieldError = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      {defaults.id ? (
        <input type="hidden" name="systemId" value={defaults.id} />
      ) : null}
      <input type="hidden" name="tariffType" value={tariffType} />

      {/* ── Basics ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
          <CardDescription>Name and describe your energy system.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">System name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={defaults.name}
              placeholder="Factory Alpha"
              required
              aria-invalid={Boolean(fieldError("name"))}
            />
            <FieldError message={fieldError("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              name="location"
              defaultValue={defaults.location}
              placeholder="Pune, MH"
            />
            <FieldError message={fieldError("location")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="systemType">System type</Label>
            <select
              id="systemType"
              name="systemType"
              defaultValue={defaults.systemType}
              className={SELECT_CLASS}
            >
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
            </select>
            <FieldError message={fieldError("systemType")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              name="currency"
              defaultValue={defaults.currency}
              className={SELECT_CLASS}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
            <FieldError message={fieldError("currency")} />
          </div>
        </CardContent>
      </Card>

      {/* ── Solar ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solar</CardTitle>
          <CardDescription>
            Installed PV capacity. Set to 0 if you have no solar yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="solarCapacityKw">Solar capacity (kW)</Label>
            <Input
              id="solarCapacityKw"
              name="solarCapacityKw"
              type="number"
              min={0}
              max={10000}
              step="0.1"
              defaultValue={defaults.solarCapacityKw}
              required
              aria-invalid={Boolean(fieldError("solarCapacityKw"))}
            />
            <FieldError message={fieldError("solarCapacityKw")} />
          </div>
        </CardContent>
      </Card>

      {/* ── Battery ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Battery</CardTitle>
          <CardDescription>
            Capacity, power limits, and the usable SOC window. The optimizer
            never schedules outside these limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="batteryCapacityKwh">Battery capacity (kWh)</Label>
            <Input
              id="batteryCapacityKwh"
              name="batteryCapacityKwh"
              type="number"
              min={0}
              max={10000}
              step="0.1"
              defaultValue={defaults.batteryCapacityKwh}
              required
              aria-invalid={Boolean(fieldError("batteryCapacityKwh"))}
            />
            <FieldError message={fieldError("batteryCapacityKwh")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batteryMaxChargeKw">Max charge power (kW)</Label>
            <Input
              id="batteryMaxChargeKw"
              name="batteryMaxChargeKw"
              type="number"
              min={0}
              max={2000}
              step="0.1"
              defaultValue={defaults.batteryMaxChargeKw}
              required
              aria-invalid={Boolean(fieldError("batteryMaxChargeKw"))}
            />
            <FieldError message={fieldError("batteryMaxChargeKw")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batteryMaxDischargeKw">Max discharge power (kW)</Label>
            <Input
              id="batteryMaxDischargeKw"
              name="batteryMaxDischargeKw"
              type="number"
              min={0}
              max={2000}
              step="0.1"
              defaultValue={defaults.batteryMaxDischargeKw}
              required
              aria-invalid={Boolean(fieldError("batteryMaxDischargeKw"))}
            />
            <FieldError message={fieldError("batteryMaxDischargeKw")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minSoc">Minimum SOC (%)</Label>
            <Input
              id="minSoc"
              name="minSoc"
              type="number"
              min={0}
              max={100}
              step="1"
              defaultValue={defaults.minSoc}
              required
              aria-invalid={Boolean(fieldError("minSoc"))}
            />
            <FieldError message={fieldError("minSoc")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxSoc">Maximum SOC (%)</Label>
            <Input
              id="maxSoc"
              name="maxSoc"
              type="number"
              min={0}
              max={100}
              step="1"
              defaultValue={defaults.maxSoc}
              required
              aria-invalid={Boolean(fieldError("maxSoc"))}
            />
            <FieldError message={fieldError("maxSoc")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batteryChargeEfficiency">Charge efficiency (0–1)</Label>
            <Input
              id="batteryChargeEfficiency"
              name="batteryChargeEfficiency"
              type="number"
              min={0.5}
              max={1}
              step="0.01"
              defaultValue={defaults.batteryChargeEfficiency}
              required
              aria-invalid={Boolean(fieldError("batteryChargeEfficiency"))}
            />
            <FieldError message={fieldError("batteryChargeEfficiency")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batteryDischargeEfficiency">
              Discharge efficiency (0–1)
            </Label>
            <Input
              id="batteryDischargeEfficiency"
              name="batteryDischargeEfficiency"
              type="number"
              min={0.5}
              max={1}
              step="0.01"
              defaultValue={defaults.batteryDischargeEfficiency}
              required
              aria-invalid={Boolean(fieldError("batteryDischargeEfficiency"))}
            />
            <FieldError message={fieldError("batteryDischargeEfficiency")} />
          </div>
        </CardContent>
      </Card>

      {/* ── Tariff ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Electricity tariff</CardTitle>
          <CardDescription>
            Flat rate or time-of-use windows — used by the cost engine and the
            battery optimizer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Tariff type">
            <Button
              type="button"
              variant={tariffType === "flat" ? "default" : "outline"}
              size="sm"
              aria-pressed={tariffType === "flat"}
              onClick={() => setTariffType("flat")}
            >
              Flat rate
            </Button>
            <Button
              type="button"
              variant={tariffType === "tou" ? "default" : "outline"}
              size="sm"
              aria-pressed={tariffType === "tou"}
              onClick={() => setTariffType("tou")}
            >
              Time of use
            </Button>
          </div>

          {tariffType === "flat" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tariffRate">Rate (per kWh)</Label>
                <Input
                  id="tariffRate"
                  name="tariffRate"
                  type="number"
                  min={0}
                  step="0.0001"
                  defaultValue={defaults.tariffRate}
                  required
                  aria-invalid={Boolean(fieldError("tariff.rate"))}
                />
                <FieldError message={fieldError("tariff.rate")} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {periods.map((period, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">Period {index + 1}</p>
                    {periods.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove period ${index + 1}`}
                        onClick={() =>
                          setPeriods((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`periodName${index}`}>Name</Label>
                      <Input
                        id={`periodName${index}`}
                        name={`periodName${index}`}
                        value={period.name}
                        onChange={(e) => updatePeriod(index, { name: e.target.value })}
                        placeholder="peak"
                      />
                      <FieldError message={fieldError(`tariff.periods.${index}.name`)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`periodStart${index}`}>Start hour</Label>
                      <Input
                        id={`periodStart${index}`}
                        name={`periodStart${index}`}
                        type="number"
                        min={0}
                        max={23}
                        value={period.startHour}
                        onChange={(e) =>
                          updatePeriod(index, { startHour: e.target.value })
                        }
                      />
                      <FieldError
                        message={fieldError(`tariff.periods.${index}.startHour`)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`periodEnd${index}`}>End hour</Label>
                      <Input
                        id={`periodEnd${index}`}
                        name={`periodEnd${index}`}
                        type="number"
                        min={0}
                        max={24}
                        value={period.endHour}
                        onChange={(e) =>
                          updatePeriod(index, { endHour: e.target.value })
                        }
                      />
                      <FieldError
                        message={fieldError(`tariff.periods.${index}.endHour`)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`periodRate${index}`}>Rate</Label>
                      <Input
                        id={`periodRate${index}`}
                        name={`periodRate${index}`}
                        type="number"
                        min={0}
                        step="0.0001"
                        value={period.rate}
                        onChange={(e) => updatePeriod(index, { rate: e.target.value })}
                      />
                      <FieldError
                        message={fieldError(`tariff.periods.${index}.rate`)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {periods.length < 6 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPeriods((prev) => [...prev, { ...EMPTY_PERIOD }])
                  }
                >
                  <Plus data-icon="inline-start" />
                  Add period
                </Button>
              ) : null}
              <FieldError message={fieldError("tariff.periods")} />
              <p className="text-xs text-muted-foreground">
                Hours use a 24-hour clock. A period ending at 24 runs to
                midnight; windows may wrap overnight (e.g. 22 → 6).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {state.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {state.error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : mode === "create" ? (
            "Create system"
          ) : (
            "Save changes"
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          You can change all of these values later.
        </p>
      </div>
    </form>
  );
}
