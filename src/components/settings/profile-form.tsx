"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updateProfileAction,
  type ProfileFormState,
} from "@/app/actions/profile";

interface ProfileFormProps {
  defaultValues: { fullName: string; phone: string };
  email: string;
}

export function ProfileForm({ defaultValues, email }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateProfileAction,
    {} satisfies ProfileFormState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium text-foreground">{email}</span>
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              defaultValue={defaultValues.fullName}
              required
              aria-invalid={Boolean(state.fieldErrors?.fullName)}
              aria-describedby={
                state.fieldErrors?.fullName ? "fullName-error" : undefined
              }
            />
            {state.fieldErrors?.fullName ? (
              <p id="fullName-error" className="text-xs text-destructive">
                {state.fieldErrors.fullName}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              defaultValue={defaultValues.phone}
              aria-invalid={Boolean(state.fieldErrors?.phone)}
              aria-describedby={
                state.fieldErrors?.phone ? "phone-error" : undefined
              }
            />
            {state.fieldErrors?.phone ? (
              <p id="phone-error" className="text-xs text-destructive">
                {state.fieldErrors.phone}
              </p>
            ) : null}
          </div>

          {state.error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {state.error}
            </div>
          ) : null}

          {state.success ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              {state.success}
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
