/**
 * Demo scenario presets (spec §48).
 *
 * Factory Alpha is the canonical faculty-demo dataset:
 *   Solar 100 kW · Battery 200 kWh · ~850 kWh/day consumption · ₹8.50/kWh.
 * Factory Alpha TOU swaps the flat tariff for a time-of-use one so the
 * battery optimizer has real arbitrage to demonstrate.
 */
import type { EnergySystemTemplate } from "@/types/energy";

export interface DemoScenario {
  key: string;
  label: string;
  description: string;
  system: EnergySystemTemplate;
  dailyKwhTarget: number;
  days: number;
  cloudiness: number;
}

const INR = "INR";

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    key: "factory-alpha",
    label: "Factory Alpha (demo)",
    description:
      "Industrial site: 100 kW solar, 200 kWh battery, ~850 kWh/day, ₹8.50/kWh flat tariff.",
    system: {
      name: "Factory Alpha",
      location: "Pune, MH",
      system_type: "industrial",
      solar_capacity_kw: 100,
      battery_capacity_kwh: 200,
      battery_max_charge_kw: 50,
      battery_max_discharge_kw: 50,
      min_soc: 10,
      max_soc: 90,
      battery_charge_efficiency: 0.95,
      battery_discharge_efficiency: 0.95,
      electricity_tariff: { type: "flat", currency: INR, rate: 8.5 },
      currency: INR,
    },
    dailyKwhTarget: 850,
    days: 30,
    cloudiness: 0.25,
  },
  {
    key: "factory-alpha-tou",
    label: "Factory Alpha TOU (demo)",
    description:
      "Same industrial site on a time-of-use tariff: ₹5/kWh off-peak, ₹14/kWh peak (17–22h) — the battery optimizer has real arbitrage to find.",
    system: {
      name: "Factory Alpha TOU",
      location: "Pune, MH",
      system_type: "industrial",
      solar_capacity_kw: 100,
      battery_capacity_kwh: 200,
      battery_max_charge_kw: 50,
      battery_max_discharge_kw: 50,
      min_soc: 10,
      max_soc: 90,
      battery_charge_efficiency: 0.95,
      battery_discharge_efficiency: 0.95,
      electricity_tariff: {
        type: "tou",
        currency: INR,
        periods: [
          { name: "off-peak", startHour: 22, endHour: 17, rate: 5 },
          { name: "peak", startHour: 17, endHour: 22, rate: 14 },
        ],
      },
      currency: INR,
    },
    dailyKwhTarget: 850,
    days: 30,
    cloudiness: 0.25,
  },
];

/** In-app scenario templates offered when creating a system manually. */
export const SCENARIO_TEMPLATES: DemoScenario[] = [
  {
    key: "residential",
    label: "Home with rooftop solar",
    description: "5 kW solar, 10 kWh battery, ~18 kWh/day.",
    system: {
      name: "Home",
      location: "",
      system_type: "residential",
      solar_capacity_kw: 5,
      battery_capacity_kwh: 10,
      battery_max_charge_kw: 3,
      battery_max_discharge_kw: 3,
      min_soc: 10,
      max_soc: 90,
      battery_charge_efficiency: 0.95,
      battery_discharge_efficiency: 0.95,
      electricity_tariff: { type: "flat", currency: INR, rate: 8.5 },
      currency: INR,
    },
    dailyKwhTarget: 18,
    days: 30,
    cloudiness: 0.25,
  },
  {
    key: "commercial",
    label: "Office with TOU tariff",
    description: "50 kW solar, 100 kWh battery, ~300 kWh/day, TOU tariff.",
    system: {
      name: "Office",
      location: "",
      system_type: "commercial",
      solar_capacity_kw: 50,
      battery_capacity_kwh: 100,
      battery_max_charge_kw: 25,
      battery_max_discharge_kw: 25,
      min_soc: 10,
      max_soc: 90,
      battery_charge_efficiency: 0.95,
      battery_discharge_efficiency: 0.95,
      electricity_tariff: {
        type: "tou",
        currency: INR,
        periods: [
          { name: "off-peak", startHour: 22, endHour: 6, rate: 5 },
          { name: "peak", startHour: 18, endHour: 22, rate: 12 },
        ],
      },
    },
    dailyKwhTarget: 300,
    days: 30,
    cloudiness: 0.25,
  },
] as DemoScenario[];
