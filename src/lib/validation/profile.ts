import { z } from "zod";

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name (at least 2 characters).")
    .max(80, "Name is too long (maximum 80 characters)."),
  phone: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^[+()0-9\s-]{7,20}$/, "Please enter a valid phone number (7-20 characters)."),
    ])
    .optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
