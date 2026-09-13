/**
 * Sanitizes a user-supplied redirect path to prevent open-redirect attacks.
 *
 * Only allows:
 *  - relative paths that start with a single "/"
 *  - no protocol-relative URLs ("//evil.com")
 *  - no backslashes ("\\evil.com" or "/\\evil.com")
 *  - no embedded protocols or control characters
 *
 * Anything suspicious (or empty) falls back to the given default.
 */
export function sanitizeRedirect(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!value) return fallback;
  if (value.length > 512) return fallback;
  // Reject control characters entirely.
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (value.includes("://")) return fallback;
  return value;
}
