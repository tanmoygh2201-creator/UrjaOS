"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addBillAction,
  deleteBillAction,
  runAlertCheckAction,
  setAlertResolvedAction,
} from "@/app/actions/alerts";

/** Runs the daily alert check for the selected system. */
export function RunCheckButton({ systemId }: { systemId: string }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setFeedback(null);
    const formData = new FormData();
    formData.set("systemId", systemId);
    startTransition(async () => {
      const result = await runAlertCheckAction(formData);
      if (result.ok) {
        setFeedback(
          `Checked ${result.daysChecked} days — ${result.created} new alert${result.created === 1 ? "" : "s"}${
            (result.skipped ?? 0) > 0 ? `, ${result.skipped} already known` : ""
          }.`
        );
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={run} disabled={pending} size="sm">
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        Run alert check
      </Button>
      {feedback ? (
        <p className="text-xs text-muted-foreground" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form to enter one utility bill for the system. */
export function AddBillForm({
  systemId,
  defaultPeriod,
  currencyLabel,
}: {
  systemId: string;
  defaultPeriod: string;
  currencyLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setSuccess(false);
    formData.set("systemId", systemId);
    startTransition(async () => {
      const result = await addBillAction(formData);
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  const numField = (name: string, label: string, step = "0.01") => (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <Input
        name={name}
        type="number"
        min="0"
        step={step}
        required
        placeholder="0"
        className="h-8"
      />
    </label>
  );

  return (
    <form action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Billing month
          <Input
            name="billingPeriod"
            type="month"
            defaultValue={defaultPeriod}
            required
            className="h-8"
          />
        </label>
        {numField("energyConsumed", "Energy consumed (kWh)", "0.1")}
        {numField("energyCharge", `Energy charge (${currencyLabel})`)}
        {numField("fixedCharge", `Fixed charge (${currencyLabel})`)}
        {numField("otherCharges", `Other charges (${currencyLabel})`)}
        {numField("totalAmount", `Bill total (${currencyLabel})`)}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Add bill
        </Button>
        {success ? (
          <p className="text-xs text-muted-foreground" role="status">
            Bill saved and analyzed below.
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Marks one alert resolved — or re-opens a resolved one. */
export function ResolveAlertButton({
  alertId,
  resolve,
  variant = "outline",
  children,
}: {
  alertId: string;
  resolve: boolean;
  variant?: "outline" | "ghost";
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act() {
    setError(null);
    const formData = new FormData();
    formData.set("alertId", alertId);
    formData.set("resolve", String(resolve));
    startTransition(async () => {
      const result = await setAlertResolvedAction(formData);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        onClick={act}
        disabled={pending}
        variant={variant}
        size="sm"
        className="h-7 text-xs"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </Button>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Deletes one saved bill for the system. */
export function DeleteBillButton({ billId }: { billId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act() {
    setError(null);
    const formData = new FormData();
    formData.set("billId", billId);
    startTransition(async () => {
      const result = await deleteBillAction(formData);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        onClick={act}
        disabled={pending}
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Delete
      </Button>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
