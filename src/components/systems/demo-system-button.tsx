"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedDemoAction } from "@/app/actions/simulation";

interface DemoSystemButtonProps {
  scenario?: string;
  label?: string;
  variant?: "default" | "outline";
}

/** Seeds the Factory Alpha demo system with 30 days of data, then navigates. */
export function DemoSystemButton({
  scenario = "factory-alpha",
  label = "Try the demo system",
  variant = "outline",
}: DemoSystemButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function seed() {
    setError(null);
    const formData = new FormData();
    formData.set("scenario", scenario);
    startTransition(async () => {
      const result = await seedDemoAction(formData);
      if (result.ok && result.systemId) {
        router.push(`/systems/${result.systemId}`);
      } else {
        setError(result.error ?? "Could not create the demo system.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={seed} disabled={pending} variant={variant}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Play aria-hidden="true" />
        )}
        {pending ? "Preparing demo…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
