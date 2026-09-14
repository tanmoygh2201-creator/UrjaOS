import { describe, expect, it } from "vitest";
import {
  buildChatRequest,
  parseChatResponse,
  ProviderError,
  resolveProviderConfig,
  type ProviderEnv,
} from "@/lib/ai/provider";
import {
  buildCopilotContext,
  buildSystemPrompt,
  type CopilotContextInput,
} from "@/lib/ai/context";
import { copilotQuestionSchema } from "@/lib/validation/copilot";
import type { EnergySystem } from "@/types/energy";

function makeSystem(): EnergySystem {
  return {
    id: "sys-1",
    user_id: "user-1",
    name: "Copilot Stub",
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
    electricity_tariff: { type: "flat", currency: "INR", rate: 8.5 },
    currency: "INR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeContext(
  overrides: Partial<CopilotContextInput> = {}
): CopilotContextInput {
  return {
    system: makeSystem(),
    analytics: {
      hasData: true,
      rangeLabel: "7 Days",
      fromDayKey: "2026-09-08",
      toDayKey: "2026-09-14",
      solarKwh: 3600,
      consumptionKwh: 5950,
      gridImportKwh: 2410,
      gridExportKwh: 60,
      batteryChargeKwh: 1130,
      batteryDischargeKwh: 900,
      peakDemandKw: 49.9,
      selfConsumptionPct: 98.3,
      gridDependencyPct: 40.5,
      solarUtilizationPct: 76.3,
      energyWastagePct: 1.7,
      batteryUtilizationPct: 64.3,
      baselineCost: 50575,
      actualGridCost: 20485,
      estimatedSavings: 30090,
    },
    forecasts: {
      hasForecasts: true,
      hasEvaluated: false,
      solarMape: null,
      consumptionMape: null,
      solarHorizonKwh: 3452.5,
      consumptionHorizonKwh: 4362,
    },
    optimization: {
      hasPlan: false,
      expectedSaving: null,
      arbitrageEnabled: null,
      totalDischargeKwh: null,
    },
    ...overrides,
  };
}

describe("provider config", () => {
  it("returns null when the key is missing or blank", () => {
    expect(resolveProviderConfig({ AI_API_KEY: "", AI_PROVIDER: "openai" })).toBeNull();
    expect(resolveProviderConfig({ AI_API_KEY: "   ", AI_PROVIDER: "openai" })).toBeNull();
    expect(resolveProviderConfig({} as ProviderEnv)).toBeNull();
  });

  it("maps providers to compatible base URLs and models", () => {
    const openai = resolveProviderConfig({
      AI_API_KEY: "sk-test",
      AI_PROVIDER: "openai",
    })!;
    expect(openai.baseUrl).toBe("https://api.openai.com/v1");
    expect(openai.model).toBe("gpt-4o-mini");

    const groq = resolveProviderConfig({
      AI_API_KEY: "gsk-test",
      AI_PROVIDER: "groq",
    })!;
    expect(groq.baseUrl).toBe("https://api.groq.com/openai/v1");

    const openrouter = resolveProviderConfig({
      AI_API_KEY: "or-test",
      AI_PROVIDER: "openrouter",
    })!;
    expect(openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("never exposes the key in the request body", () => {
    const config = resolveProviderConfig({
      AI_API_KEY: "sk-secret",
      AI_PROVIDER: "openai",
    })!;
    const { url, body, headers } = buildChatRequest(config, [
      { role: "user", content: "hello" },
    ]);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    expect(headers.Authorization).toBe("Bearer sk-secret");
    expect(body.model).toBe(config.model);
  });
});

describe("response parsing", () => {
  it("extracts the message content from a valid payload", () => {
    expect(
      parseChatResponse({
        choices: [{ message: { role: "assistant", content: "  Answer  " } }],
      })
    ).toBe("Answer");
  });

  it("throws bad_response on malformed payloads", () => {
    for (const payload of [null, {}, { choices: [] }, { choices: [{}] }]) {
      expect(() => parseChatResponse(payload)).toThrow(ProviderError);
    }
  });
});

describe("grounding prompt invariants", () => {
  it("includes real numbers and the honesty rules in the system prompt", () => {
    const prompt = buildSystemPrompt(buildCopilotContext(makeContext()));
    expect(prompt).toContain("UrjaOS Copilot");
    expect(prompt).toContain("ONLY");
    expect(prompt).toContain("never invent numbers");
    expect(prompt).toContain("ESTIMATE");
    expect(prompt).toContain("decision-support");
    // Real figures from the context block must appear verbatim.
    expect(prompt).toContain("3600 kWh");
    expect(prompt).toContain("5950 kWh");
    expect(prompt).toContain("30090");
    expect(prompt).toContain("₹8.50/kWh flat");
    // Forecast horizon numbers present.
    expect(prompt).toContain("3452.5");
  });

  it("states missing data instead of leaving gaps to fill", () => {
    const context = makeContext({
      analytics: null,
      forecasts: {
        hasForecasts: false,
        hasEvaluated: false,
        solarMape: null,
        consumptionMape: null,
        solarHorizonKwh: null,
        consumptionHorizonKwh: null,
      },
      optimization: {
        hasPlan: false,
        expectedSaving: null,
        arbitrageEnabled: null,
        totalDischargeKwh: null,
      },
    });
    const prompt = buildSystemPrompt(buildCopilotContext(context));
    expect(prompt).toContain("no readings yet");
    expect(prompt).toContain("No forecasts generated yet");
    expect(prompt).toContain("No optimization schedule generated yet");
  });

  it("reports measured MAPE only when evaluated forecasts exist", () => {
    const withAccuracy = buildCopilotContext(
      makeContext({
        forecasts: {
          hasForecasts: true,
          hasEvaluated: true,
          solarMape: 18.4,
          consumptionMape: 7.9,
          solarHorizonKwh: 3452.5,
          consumptionHorizonKwh: 4362,
        },
      })
    );
    expect(withAccuracy).toContain("18.4%");
    expect(withAccuracy).toContain("7.9%");
    expect(withAccuracy).toContain("MEASURED");

    const without = buildCopilotContext(makeContext());
    expect(without).toContain("not yet measurable");
  });
});

describe("question validation", () => {
  it("accepts reasonable questions and trims them", () => {
    const result = copilotQuestionSchema.safeParse({ question: "  Why is my grid import high?  " });
    expect(result.success).toBe(true);
    expect(result.data?.question).toBe("Why is my grid import high?");
  });

  it("rejects empty, short, and oversized questions", () => {
    expect(copilotQuestionSchema.safeParse({ question: "" }).success).toBe(false);
    expect(copilotQuestionSchema.safeParse({ question: "ab" }).success).toBe(false);
    expect(
      copilotQuestionSchema.safeParse({ question: "x".repeat(501) }).success
    ).toBe(false);
    expect(copilotQuestionSchema.safeParse({}).success).toBe(false);
  });
});
