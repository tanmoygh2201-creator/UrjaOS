import { z } from "zod";

/**
 * Shared email schema: trims whitespace, lowercases, then validates format.
 * (Zod v4 exposes top-level `z.email()`; piping keeps the transforms.)
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name (at least 2 characters).")
    .max(80, "Name is too long (maximum 80 characters)."),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password is too long (maximum 72 characters)."),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Please enter your password."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

/** Flattens a Zod error into `{ field: firstMessage }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}
