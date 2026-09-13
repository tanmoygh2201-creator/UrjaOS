/**
 * UrjaOS cost & savings engine (spec §30-31).
 *
 * Pure functions, no I/O — all energies are kWh, all rates are
 * currency-per-kWh. Savings outputs are ESTIMATES and must be labeled as such
 * in the UI (never presented as guaranteed).
 */

/** Cost of grid-imported energy for one interval. */
export function calculateGridCost(
  importKwh: number,
  tariffRate: number
): number {
  if (importKwh <= 0) return 0;
  return importKwh * Math.max(0, tariffRate);
}

/**
 * Savings from solar in one interval: the grid energy that solar avoided
 * serving, valued at the tariff in effect.
 */
export function calculateSolarSavings(
  solarKwh: number,
  consumptionKwh: number,
  tariffRate: number
): number {
  const servedBySolar = Math.min(Math.max(0, solarKwh), Math.max(0, consumptionKwh));
  return calculateGridCost(servedBySolar, tariffRate);
}

/**
 * Savings from battery discharge: the grid energy the battery avoided serving,
 * valued at the tariff in effect. (Charging from solar is already captured by
 * solar savings; charging from grid at cheap rates is an optimizer gain.)
 */
export function calculateBatterySavings(
  dischargeKwh: number,
  tariffRate: number
): number {
  return calculateGridCost(Math.max(0, dischargeKwh), tariffRate);
}

/**
 * Estimated savings vs. a no-solar, no-battery baseline: every kWh that did
 * not come from the grid is valued at the tariff in effect. This is the
 * honest definition of "savings" and cannot double-count.
 */
export function calculateEstimatedSavings(params: {
  solarServedKwh: number;
  batteryServedKwh: number;
  tariffRate: number;
}): number {
  const { solarServedKwh, batteryServedKwh, tariffRate } = params;
  const avoidedKwh = Math.max(0, solarServedKwh) + Math.max(0, batteryServedKwh);
  return calculateGridCost(avoidedKwh, tariffRate);
}

/** Total energy cost for a period from grid imports. */
export function calculateTotalEnergyCost(
  hourlyImports: { kwh: number; tariffRate: number }[]
): number {
  return hourlyImports.reduce(
    (sum, h) => sum + calculateGridCost(h.kwh, h.tariffRate),
    0
  );
}

/** Solar self-consumption (%): share of generated solar used on-site. */
export function calculateSelfConsumption(
  solarKwh: number,
  exportedKwh: number
): number {
  const generated = Math.max(0, solarKwh);
  if (generated === 0) return 0;
  const exported = Math.min(Math.max(0, exportedKwh), generated);
  return ((generated - exported) / generated) * 100;
}

/** Solar utilization (%): share of consumption covered by solar + battery. */
export function calculateSolarUtilization(params: {
  solarKwh: number;
  batteryDischargeKwh: number;
  consumptionKwh: number;
}): number {
  const consumption = Math.max(0, params.consumptionKwh);
  if (consumption === 0) return 0;
  const covered = Math.min(
    Math.max(0, params.solarKwh) + Math.max(0, params.batteryDischargeKwh),
    consumption
  );
  return (covered / consumption) * 100;
}

/** Grid dependency (%): share of consumption served by grid imports. */
export function calculateGridDependency(
  importKwh: number,
  consumptionKwh: number
): number {
  const consumption = Math.max(0, consumptionKwh);
  if (consumption === 0) return 0;
  const imported = Math.min(Math.max(0, importKwh), consumption);
  return (imported / consumption) * 100;
}

/** Energy wasted (%): exported solar relative to what was generated. */
export function calculateEnergyWastage(
  solarKwh: number,
  exportedKwh: number
): number {
  const generated = Math.max(0, solarKwh);
  if (generated === 0) return 0;
  return (Math.min(Math.max(0, exportedKwh), generated) / generated) * 100;
}

/** Baseline (no-solar, no-battery) cost for a period. */
export function calculateBaselineCost(
  consumptionKwh: number,
  tariffRate: number
): number {
  return calculateGridCost(Math.max(0, consumptionKwh), tariffRate);
}
