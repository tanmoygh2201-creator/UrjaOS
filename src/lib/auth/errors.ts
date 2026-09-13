/**
 * Maps Supabase Auth errors to safe, user-friendly messages.
 *
 * We never surface raw provider messages or internals to the UI.
 * Accepts the minimal shape we use, so tests don't need a Supabase client.
 */
export interface AuthProviderError {
  message: string;
  status?: number;
  code?: string;
}

export function getAuthErrorMessage(error: AuthProviderError): string {
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code ?? "";

  if (code === "user_already_exists" || message.includes("already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (message.includes("email not confirmed")) {
    return "Please confirm your email address before signing in. Check your inbox for the confirmation link.";
  }
  if (error.status === 429 || message.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (message.includes("password should be at least") || message.includes("weak password")) {
    return "Password is too weak. Use at least 8 characters.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Could not reach the authentication service. Check your connection and try again.";
  }
  // Fallback — intentionally generic: never leak provider internals.
  return "Something went wrong. Please try again.";
}
