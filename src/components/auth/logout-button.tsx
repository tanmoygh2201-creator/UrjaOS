"use client";

import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/auth";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => signOutAction())}
      aria-label="Sign out of UrjaOS"
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <LogOut aria-hidden="true" />
      )}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
