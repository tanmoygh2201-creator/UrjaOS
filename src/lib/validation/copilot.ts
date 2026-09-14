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

/** Grounding examples offered in the UI (spec §41). */
export const SUGGESTED_QUESTIONS = [
  "How much did solar save me this week?",
  "Why is my grid import high at night?",
  "What will my consumption be tomorrow?",
  "How accurate are the forecasts for my system?",
  "How can I reduce my electricity bill?",
  "Is my battery being used efficiently?",
] as const;
