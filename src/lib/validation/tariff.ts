import { z } from "zod";

/**
 * Tariff configuration: a flat rate or time-of-use (TOU) periods.
 *
 * Shape mirrors `TariffConfig` in src/types/energy.ts, which mirrors the
 * `electricity_tariff` jsonb column in the energy_systems table.
 */
export const tariffPeriodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Period name is required (e.g. peak).")
    .max(30, "Period name is too long."),
  startHour: z.coerce
    .number({ message: "Start hour must be a number." })
    .int("Start hour must be a whole hour.")
    .min(0, "Start hour is between 0 and 23.")
    .max(23, "Start hour is between 0 and 23."),
  endHour: z.coerce
    .number({ message: "End hour must be a number." })
    .int("End hour must be a whole hour.")
    .min(0, "End hour is between 0 and 24.")
    .max(24, "End hour is between 0 and 24."),
  rate: z.coerce
    .number({ message: "Rate must be a number." })
    .min(0, "Rate cannot be negative.")
    .max(1000, "Rate looks too large (maximum 1000 per kWh)."),
});

export const tariffConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("flat"),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code (e.g. INR)."),
    rate: z.coerce
      .number({ message: "Rate must be a number." })
      .min(0, "Rate cannot be negative.")
      .max(1000, "Rate looks too large (maximum 1000 per kWh)."),
  }),
  z.object({
    type: z.literal("tou"),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code (e.g. INR)."),
    periods: z
      .array(tariffPeriodSchema)
      .min(1, "Add at least one time-of-use period.")
      .max(6, "At most 6 time-of-use periods are supported."),
  }),
]);

export type TariffConfigInput = z.infer<typeof tariffConfigSchema>;

/**
 * Returns the rate in effect for a given hour of day (0-23).
 * For TOU tariffs, later periods win when windows overlap.
 */
export function getTariffRateForHour(
  tariff: TariffConfigInput,
  hour: number
): number {
  const h = ((hour % 24) + 24) % 24;
  if (tariff.type === "flat") return tariff.rate;

  let rate = 0;
  for (const period of tariff.periods) {
    const { startHour, endHour } = period;
    const inWindow =
      startHour <= endHour
        ? h >= startHour && h < endHour
        : h >= startHour || h < endHour; // overnight wrap (e.g. 22 → 06)
    if (inWindow) rate = period.rate;
  }
  return rate;
}
