/**
 * Smart question routing (Copilot upgrade).
 *
 * Decides — before any provider call — whether a question needs:
 *   - "data"    → UrjaOS readings/forecasts/plans (grounded context required)
 *   - "general" → plain AI knowledge (no data fetch, fast + cheap)
 *   - "both"    → user's data PLUS general energy knowledge
 *
 * Pure and deterministic so it is fully testable. The rule set is
 * intentionally conservative: personal pronouns or system-analysis verbs
 * pull toward data; a data subject combined with explanation verbs pulls
 * toward "both"; everything else stays "general" so the assistant behaves
 * like a normal chatbot.
 */

export type CopilotRoute = "data" | "general" | "both";

export interface RouteDecision {
  route: CopilotRoute;
  /** Why the router chose this — surfaced in tests, useful for debugging. */
  reason: string;
}

/** Terms that refer to the user's own system or its readings. */
const DATA_SUBJECTS = [
  "my solar",
  "my battery",
  "my system",
  "my consumption",
  "my energy",
  "my bill",
  "my grid",
  "my forecast",
  "my usage",
  "my load",
  "my tariff",
  "my panel",
  "my inverter",
  "my export",
  "my import",
  "my savings",
  "my soc",
  "my copilot",
] as const;

/** Generic first-person questions that still need the data block. */
const DATA_PATTERNS: RegExp[] = [
  /\bmy\b/i,
  /\b(current|right now|today|this week|this month|yesterday|tonight)\b/i,
  /\b(soc|state of charge)\b/i,
  /\b(how (much|many) (energy|power|kwh|units) )/i,
  /\b(analyz|analyz|monitor|check|status of) (my|the) (system|battery|solar|consumption|energy)/i,
];

/** Verbs/frames that ask for explanation, comparison, or improvement advice. */
const EXPLAIN_MARKERS = [
  "why",
  "how can",
  "how do i",
  "how to",
  "improve",
  "optimize",
  "reduce",
  "increase",
  "fix",
  "explain",
  "compare",
  "vs",
  "better",
  "mean",
  "what does",
] as const;

/** Well-known concepts that are general knowledge even in energy chats. */
const CONCEPT_MARKERS = [
  "mppt",
  "what is",
  "what are",
  "define",
  "difference between",
  "how does",
  "how do",
  "lithium",
  "li-ion",
  "lfp",
  "lead acid",
  "inverter",
  "kruby",
  "perovskite",
  "monocrystalline",
  "polycrystalline",
  "iot",
  "mqtt",
  "cloud",
  "grid frequency",
  "power factor",
] as const;

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Classifies a question. `mode` from the UI can force routing:
 * - "data"  → the user pressed "Ask About My Energy System": always analyze
 *             the system data (with general knowledge allowed for advice).
 * - "auto"  → classify from the text.
 */
export function classifyQuestion(
  question: string,
  mode: "auto" | "data" = "auto"
): RouteDecision {
  if (mode === "data") {
    return { route: "both", reason: "forced by UI data-mode toggle" };
  }

  const q = question.toLowerCase();

  const hasDataSubject = includesAny(q, DATA_SUBJECTS) || DATA_PATTERNS.some((re) => re.test(q));
  const isExplainer = includesAny(q, EXPLAIN_MARKERS);
  const isConcept = includesAny(q, CONCEPT_MARKERS);

  // Concept questions with no personal data referents stay general, even
  // when they touch energy topics ("What is MPPT?").
  if (isConcept && !hasDataSubject) {
    return { route: "general", reason: "general concept question" };
  }

  if (hasDataSubject && isExplainer) {
    return { route: "both", reason: "personal data + explanation request" };
  }

  if (hasDataSubject) {
    return { route: "data", reason: "references the user's own system" };
  }

  return { route: "general", reason: "no data referents found" };
}
