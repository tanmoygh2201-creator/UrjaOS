"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUpSchema, signInSchema, fieldErrors } from "@/lib/validation/auth";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { sanitizeRedirect } from "@/lib/auth/redirect";

/** Shape exchanged between auth forms and their server actions. */
export interface AuthFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

/** Resolves the current origin for email-verification links. */
async function getOrigin(): Promise<string> {
  const headerList = await headers();
  return headerList.get("origin") ?? "http://localhost:3000";
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await getOrigin()}/auth/callback`,
    },
  });

  if (error) {
    return { error: getAuthErrorMessage(error) };
  }

  // If email confirmation is disabled (local dev), a session exists right away.
  if (data.session) {
    redirect("/dashboard");
  }

  return {
    success:
      "Account created! Please check your inbox for a confirmation link to activate your account.",
  };
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: getAuthErrorMessage(error) };
  }

  redirect(sanitizeRedirect(formData.get("next") as string | null));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
