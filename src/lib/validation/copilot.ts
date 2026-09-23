import { z } from "zod";

/** A copilot question: trimmed, bounded, no control characters. */
export const copilotQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Ask a question of at least 3 characters.")
    .max(500, "Questions are limited to 500 characters."),
});

export type CopilotQuestionInput = z.infer<typeof copilotQuestionSchema>;

/** The full ask payload: question + UI mode + visual flag + recent history. */
export const copilotAskSchema = copilotQuestionSchema.extend({
  /** "data" forces energy-data analysis; "auto" lets the router decide. */
  mode: z.enum(["auto", "data"]).default("auto"),
  /** True when the user pressed "Generate Visual". */
  visual: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  /** Recent turns (bounded) so the chat feels continuous. */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .max(8)
    .optional(),
});

export type CopilotAskInput = z.infer<typeof copilotAskSchema>;

/** Grounding examples offered in the UI (spec §41). */
export const SUGGESTED_QUESTIONS = [
  "How much did solar save me this week?",
  "Why is my grid import high at night?",
  "What will my consumption be tomorrow?",
  "How accurate are the forecasts for my system?",
  "How can I reduce my electricity bill?",
  "Is my battery being used efficiently?",
] as const;

/** General-chat starter suggestions (routing shows them off naturally). */
export const GENERAL_SUGGESTIONS = [
  "Explain MPPT in simple terms",
  "Compare lithium-ion vs lead-acid batteries",
  "How do solar inverters work?",
  "Summarize how net metering works",
] as const;

/** Data-mode quick actions requested by the product spec. */
export const DATA_SUGGESTIONS = [
  "Analyze my battery",
  "Why is my solar output low?",
  "Optimize my energy usage",
  "Analyze my energy consumption",
] as const;
