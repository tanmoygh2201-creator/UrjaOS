import { z } from "zod";
import { tariffConfigSchema } from "./tariff";
import { fieldErrors } from "./auth";

export const energySystemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please give the system a name (at least 2 characters).")
    .max(80, "Name is too long (maximum 80 characters)."),
  location: z
    .union([z.literal(""), z.string().trim().max(120, "Location is too long.")])
    .optional(),
  systemType: z.enum(["residential", "commercial", "industrial"], {
    message: "Please choose a system type.",
  }),
  solarCapacityKw: z.coerce
    .number({ message: "Solar capacity must be a number." })
    .min(0, "Solar capacity cannot be negative.")
    .max(10000, "Solar capacity looks too large (maximum 10,000 kW)."),
  batteryCapacityKwh: z.coerce
    .number({ message: "Battery capacity must be a number." })
    .min(0, "Battery capacity cannot be negative.")
    .max(10000, "Battery capacity looks too large (maximum 10,000 kWh)."),
  batteryMaxChargeKw: z.coerce
    .number({ message: "Max charge power must be a number." })
    .min(0, "Max charge power cannot be negative.")
    .max(2000, "Max charge power looks too large (maximum 2,000 kW)."),
  batteryMaxDischargeKw: z.coerce
    .number({ message: "Max discharge power must be a number." })
    .min(0, "Max discharge power cannot be negative.")
    .max(2000, "Max discharge power looks too large (maximum 2,000 kW)."),
  minSoc: z.coerce
    .number({ message: "Minimum SOC must be a number." })
    .min(0, "Minimum SOC cannot be below 0.")
    .max(100, "Minimum SOC cannot exceed 100."),
  maxSoc: z.coerce
    .number({ message: "Maximum SOC must be a number." })
    .min(0, "Maximum SOC cannot be below 0.")
    .max(100, "Maximum SOC cannot exceed 100."),
  batteryChargeEfficiency: z.coerce
    .number({ message: "Charge efficiency must be a number." })
    .min(0.5, "Charge efficiency must be between 0.50 and 1.00.")
    .max(1, "Charge efficiency must be between 0.50 and 1.00."),
  batteryDischargeEfficiency: z.coerce
    .number({ message: "Discharge efficiency must be a number." })
    .min(0.5, "Discharge efficiency must be between 0.50 and 1.00.")
    .max(1, "Discharge efficiency must be between 0.50 and 1.00."),
  tariff: tariffConfigSchema,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code (e.g. INR)."),
});

export type EnergySystemInput = z.infer<typeof energySystemSchema>;

/** Cross-field battery constraint (mirrors the DB CHECK). */
export function validateSystemCrossFields(
  input: EnergySystemInput
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.minSoc >= input.maxSoc) {
    errors.minSoc =
      "Minimum SOC must be lower than the maximum SOC (e.g. 10% and 90%).";
  }
  return errors;
}

/** Full validation: schema + cross-field rules. */
export function validateEnergySystem(
  data: unknown
): { ok: true; data: EnergySystemInput } | { ok: false; errors: Record<string, string> } {
  const parsed = energySystemSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const cross = validateSystemCrossFields(parsed.data);
  if (Object.keys(cross).length > 0) {
    return { ok: false, errors: cross };
  }
  return { ok: true, data: parsed.data };
}

export { fieldErrors };
