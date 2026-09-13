import { z } from "zod";

export const generateSimulationSchema = z.object({
  days: z.coerce
    .number({ message: "Days must be a number." })
    .int("Days must be a whole number.")
    .min(1, "Generate at least 1 day.")
    .max(92, "Generate at most 92 days at a time."),
  /** 0 = sunny, 1 = overcast. Optional; defaults to the normal mix. */
  cloudiness: z.coerce.number().min(0).max(1).optional(),
  /** Optional override of the average daily consumption target (kWh). */
  dailyKwhTarget: z.coerce
    .number()
    .min(1, "Daily consumption must be at least 1 kWh.")
    .max(100000, "Daily consumption looks too large.")
    .optional(),
});

export type GenerateSimulationInput = z.infer<typeof generateSimulationSchema>;

export const demoSeedSchema = z.object({
  scenario: z.string().trim().min(1).max(40).default("factory-alpha"),
});
