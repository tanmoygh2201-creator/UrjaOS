"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
import type { AuthFormState } from "@/app/actions/auth";

type Mode = "login" | "register";

interface AuthFormProps {
  mode: Mode;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  /** Prefilled redirect target for login (already sanitized server-side). */
  next?: string;
  /** Non-field error passed via URL (e.g. expired email link). */
  initialError?: string | null;
}

const COPY: Record<
  Mode,
  {
    title: string;
    description: string;
    submit: string;
    pending: string;
    altText: string;
    altLink: string;
    altHref: "/register" | "/login";
  }
> = {
  login: {
    title: "Welcome back",
    description: "Sign in to your UrjaOS account.",
    submit: "Sign in",
    pending: "Signing in…",
    altText: "Don't have an account?",
    altLink: "Create one",
    altHref: "/register",
  },
  register: {
    title: "Create your account",
    description: "Start monitoring and optimizing your energy.",
    submit: "Create account",
    pending: "Creating account…",
    altText: "Already have an account?",
    altLink: "Sign in",
    altHref: "/login",
  },
};

export function AuthForm({ mode, action, next, initialError }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const copy = COPY[mode];

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {initialError ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {initialError}
          </div>
        ) : null}

        {state.success ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.success}
          </div>
        ) : (
          <form action={formAction} className="space-y-4" noValidate>
            {mode === "login" && next ? (
              <input type="hidden" name="next" value={next} />
            ) : null}

            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Ada Sharma"
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
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                aria-invalid={Boolean(state.fieldErrors?.email)}
                aria-describedby={
                  state.fieldErrors?.email ? "email-error" : undefined
                }
              />
              {state.fieldErrors?.email ? (
                <p id="email-error" className="text-xs text-destructive">
                  {state.fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                required
                aria-invalid={Boolean(state.fieldErrors?.password)}
                aria-describedby={
                  state.fieldErrors?.password ? "password-error" : undefined
                }
              />
              {state.fieldErrors?.password ? (
                <p id="password-error" className="text-xs text-destructive">
                  {state.fieldErrors.password}
                </p>
              ) : null}
            </div>

            {state.error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {state.error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  {copy.pending}
                </>
              ) : (
                copy.submit
              )}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {copy.altText}{" "}
          <Link
            href={copy.altHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.altLink}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
