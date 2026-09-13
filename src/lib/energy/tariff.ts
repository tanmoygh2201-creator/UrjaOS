import type { TariffConfig } from "@/types/energy";
import { getCurrencySymbol } from "./format";

/** Human-readable tariff summary, e.g. "₹8.50/kWh flat" or a TOU period list. */
export function formatTariffSummary(tariff: TariffConfig): string {
  const symbol = getCurrencySymbol(tariff.currency);
  if (tariff.type === "flat") {
    return `${symbol}${tariff.rate.toFixed(2)}/kWh flat`;
  }
  return tariff.periods
    .map(
      (p) =>
        `${p.name} ${p.startHour}–${p.endHour}h @ ${symbol}${p.rate.toFixed(2)}`
    )
    .join(" · ");
}
