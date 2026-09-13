import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { signInAction } from "@/app/actions/auth";
import { sanitizeRedirect } from "@/lib/auth/redirect";

export const metadata = { title: "Sign in" };

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizeRedirect(params.next);
  const hasError = params.error === "invalid_link";

  // /login?next=… should never itself be an auth destination.
  if (params.next) {
    redirect(next);
  }

  return (
    <AuthForm
      mode="login"
      action={signInAction}
      next={next}
      initialError={
        hasError
          ? "That sign-in link is invalid or has expired. Please sign in again."
          : null
      }
    />
  );
}
