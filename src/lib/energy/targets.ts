import type { SystemType } from "@/types/energy";

/** Rough per-type daily consumption targets used by the simulator defaults. */
export function defaultDailyTarget(systemType: SystemType): number {
  switch (systemType) {
    case "residential":
      return 18;
    case "commercial":
      return 300;
    case "industrial":
      return 850;
  }
}
