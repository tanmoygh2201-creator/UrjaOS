/** Currency symbols for codes the app currently supports. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

/** Formats an amount of currency, e.g. 4820.5 → "₹4,820.50". */
export function formatCurrency(
  amount: number,
  currency = "INR",
  fractionDigits = 2
): string {
  const symbol = getCurrencySymbol(currency);
  const formatted = amount.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${symbol}${formatted}`;
}

/** Formats energy in kWh, e.g. 42.8 → "42.8 kWh". */
export function formatKwh(value: number, fractionDigits = 1): string {
  return `${value.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} kWh`;
}

/** Formats power in kW, e.g. 6.25 → "6.25 kW". */
export function formatKw(value: number, fractionDigits = 2): string {
  return `${value.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} kW`;
}

/** Formats a percentage, e.g. 78.4 → "78%". */
export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}
