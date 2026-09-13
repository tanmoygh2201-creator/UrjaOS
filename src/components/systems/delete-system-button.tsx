"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSystemAction } from "@/app/actions/systems";

interface DeleteSystemButtonProps {
  systemId: string;
  systemName: string;
}

/** Two-step inline confirmation — no accidental deletes. */
export function DeleteSystemButton({
  systemId,
  systemName,
}: DeleteSystemButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden="true" />
        Delete
      </Button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Delete ${systemName}`}
      className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5"
    >
      <span className="text-sm text-destructive">
        Delete “{systemName}” and all its data?
      </span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("systemId", systemId);
          startTransition(() => {
            void deleteSystemAction(formData);
          });
        }}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
