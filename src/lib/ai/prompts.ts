/**
 * Prompt suite for the upgraded Copilot.
 *
 * Three distinct system prompts keep behavior honest:
 *  - general : a normal helpful AI chatbot (no fake data access)
 *  - data    : grounded ONLY in the UrjaOS factual block
 *  - both    : the user's data PLUS general energy knowledge, clearly separated
 *  - visual  : SVG diagram generation, grounded in the factual block when present
 *
 * Conversation history rides as plain user/assistant turns; the factual block
 * (when present) always travels in the system role so a long chat never
 * buries the grounding rules.
 */

import type { ChatMessage } from "@/lib/ai/provider";
import type { CopilotRoute } from "@/lib/ai/routing";

const GENERAL_RULES = [
  "Style rules:",
  "- IMPORTANT: reply with the FINAL ANSWER ONLY. Never show your internal reasoning,",
  "  thinking process, chain of thought, or planning notes in the reply.",
  "- Be concise and concrete; prefer short paragraphs and at most 4-5 bullets.",
  "- Use markdown for structure (bold key terms, lists, fenced code blocks for code).",
  "- Never claim to have taken an action in any app; you only answer.",
  "- If you are unsure, say so plainly.",
].join("\n");

/** Plain conversational assistant — no data access is implied or faked. */
export function buildGeneralPrompt(): string {
  return [
    "You are UrjaOS Copilot, a knowledgeable, friendly AI assistant built into the UrjaOS energy platform.",
    "You can answer ANY question: general knowledge, science and technology, programming, mathematics,",
    "renewable energy, solar power, batteries, IoT, cloud computing, study help, explanations, comparisons,",
    "summaries, brainstorming, and technical questions.",
    "",
    "You do NOT currently see the user's energy-system readings. If the user asks for their own data,",
    "say you can answer that in Energy-System mode (the data-analysis mode of this chat) and to ask again",
    "with data mode enabled — never invent or estimate their readings.",
    "",
    GENERAL_RULES,
  ].join("\n");
}

/** Strictly grounded in the factual block — the classic behavior, preserved. */
export function buildDataPrompt(contextBlock: string): string {
  return [
    "You are UrjaOS Copilot, an energy-management assistant inside the UrjaOS platform.",
    "The user owns the energy system described below. This is ENERGY-DATA ANALYSIS mode: answer ONLY",
    "from the factual data in this message. If the answer is not derivable from this data, say plainly",
    "that you do not have that data — never invent numbers, never guess.",
    "",
    "Rules:",
    "- IMPORTANT: reply with the FINAL ANSWER ONLY — no reasoning process, no planning notes.",
    "- Savings figures are ESTIMATES valued at the user's tariff; always keep (or add) the",
    "  'estimate, not guaranteed' qualifier when you mention them.",
    "- Optimization outputs are decision-support recommendations, never device commands.",
    "- Be concrete: quote the exact numbers from the data block when they answer the question.",
    "- Currency follows the tariff line in the data block.",
    "- General energy knowledge may explain the numbers, but every READING must come from the block.",
    "",
    "FACTUAL DATA BLOCK (the only source of truth for readings):",
    "────────────────────────────────────────",
    contextBlock,
    "────────────────────────────────────────",
  ].join("\n");
}

/** User's data + general knowledge, with an explicit separation rule. */
export function buildBothPrompt(contextBlock: string): string {
  return [
    "You are UrjaOS Copilot, an energy-management assistant inside the UrjaOS platform.",
    "You have TWO knowledge sources, and you must keep them clearly separated:",
    "  1. The user's OWN SYSTEM DATA (the factual block below) — real readings, forecasts, and plans.",
    "  2. Your GENERAL knowledge of energy technology (how batteries, solar, MPPT, tariffs, etc. work).",
    "",
    "When analyzing the system, structure practical answers as:",
    "**Current status** → **What it means** → **Possible cause** → **Recommendation** → **Relevant data**",
    "(use these headings only where they help; short answers can merge steps).",
    "",
    "Rules:",
    "- IMPORTANT: reply with the FINAL ANSWER ONLY — no reasoning process, no planning notes.",
    "- Every reading/number about THEIR system must come from the factual block. If a value they ask",
    "  about is not in the block, say it is unavailable — never fabricate or estimate readings.",
    "- Clearly distinguish actual project data from general knowledge (e.g. 'your data shows…' vs",
    "  'in general, lithium-ion…').",
    "- Savings figures are ESTIMATES valued at the user's tariff; keep the 'estimate, not guaranteed'",
    "  qualifier.",
    "- Recommendations are decision-support, never device commands.",
    "- Quote exact numbers from the block when they answer the question. Currency follows the tariff line.",
    "- Use markdown; keep answers under ~220 words unless the question genuinely needs more.",
    "",
    "FACTUAL DATA BLOCK (the only source of truth for the user's readings):",
    "────────────────────────────────────────",
    contextBlock,
    "────────────────────────────────────────",
  ].join("\n");
}

/** SVG visual-explanation prompt. `contextBlock` is null for pure concepts. */
export function buildVisualPrompt(question: string, contextBlock: string | null): string {
  const grounding = contextBlock
    ? [
        "",
        "If the request concerns the user's system (e.g. 'visualize my energy flow'), base the diagram on",
        "the FACTUAL DATA BLOCK below and include the real numbers as labels. If the block lacks a value",
        "the diagram needs, draw the concept with the data you have and say which values are missing —",
        "never invent readings.",
        "",
        "FACTUAL DATA BLOCK:",
        "────────────────────────────────────────",
        contextBlock,
        "────────────────────────────────────────",
      ].join("\n")
    : [
        "",
        "This is a concept diagram — do not include any user-system readings or invented numbers; label",
        "the physics/flow instead.",
      ].join("\n");

  return [
    "You are UrjaOS Copilot's visual-explainer. The user wants a clear educational DIAGRAM.",
    "Reply with ONLY one fenced code block containing a single complete standalone ```svg",
    "document — no prose before or after, no explanations. Keep the SVG compact (aim for",
    "under 60 elements) so it completes quickly.",
    "",
    "SVG rules:",
    "- Root element: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 760 420\" width=\"100%\">.",
    "- Dark background (#0d1626) with solar-gold (#f5b31b), electric-cyan (#38bdf8), battery-green",
    "  (#34d399) accents and near-white (#e8edf5) labels — the UrjaOS palette.",
    "- font-family=\"system-ui, sans-serif\", minimum 13px text, high contrast.",
    "- Draw boxes/arrows/labels that genuinely explain the concept: energy flow arrows with direction,",
    "  stage boxes, short annotations. No gradients that hurt legibility; no external images or fonts.",
    "- Keep total size under 8 KB. No scripts, no foreignObject, no event handlers.",
    grounding,
  ].join("\n");
}

/**
 * Prompt for the raster image provider (AI_IMAGE_* endpoint).
 *
 * `isConcept` is true when no UrjaOS context was loaded — concept diagrams
 * must not depict user readings. The prompt is deliberately descriptive
 * (image models need scene language, not bullet logic) and always stays
 * generic: no invented meter values, no fake dashboards presented as data.
 */
export function buildVisualImagePrompt(question: string, isConcept: boolean): string {
  const conceptRules = isConcept
    ? "This is a generic educational concept — do not depict any specific meter readings, dashboard numbers, or a person's system data."
    : "Focus on the concept being asked about; do not invent specific numeric readings for the user's system.";
  return [
    `Create a clean, modern flat-style technical illustration for an energy-platform help article.`,
    `Topic: ${question.trim()}.`,
    `Visual language: dark navy background (#0d1626), solar-gold (#f5b31b) and electric-cyan (#38bdf8) accents,`,
    `simple geometric components, labeled arrows showing energy direction, generous spacing, no text walls`,
    `(short labels only, correct spelling), no photorealism, no watermark, no logo.`,
    conceptRules,
    `Square composition suitable for embedding in a chat bubble.`,
  ].join(" ");
}

/**
 * Strips visible reasoning artifacts that reasoning-style models sometimes
 * leak into `message.content` (e.g. Nemotron's "Here's a thinking process:",
 * gpt-oss's "Analysis:"). Also trims a leading "Final answer" style header
 * the models use to mark the transition to the visible reply.
 */
export function stripReasoningArtifacts(text: string): string {
  let out = text;
  const start = out.search(
    /(here'?s a thinking process|thinking process\s*:|^analysis\s*:|^let me (think|work)|^first,? let)/i
  );
  if (start !== -1) {
    // Prefer cutting at the model's own transition marker when present.
    const transitions = [
      out.search(/\bfinal answer\s*:?/i),
      out.search(/\bresponse\s*:?\s*$/im),
      out.search(/\banswer\s*:?\s*$\n?/im),
    ].filter((i) => i > start);
    if (transitions.length > 0) {
      out = out.slice(Math.min(...transitions));
    } else {
      return ""; // no visible answer after the leaked reasoning
    }
  }
  return out.replace(/^\s*final answer\s*:?\s*/i, "").trim();
}

/**
 * Extracts an SVG document from a model reply.
 *
 * Prefers a fenced \`\`\`svg block; falls back to a bare `<svg>…</svg>`
 * span (models sometimes lose the closing fence when token budgets run
 * tight, but the SVG element itself is complete).
 */
export function extractSvgBlock(text: string): string | null {
  const fenced = /```(?:svg|xml)?\s*(<svg[\s\S]*?<\/svg>)\s*```/i.exec(text);
  const bare = /(<svg[\s\S]*?<\/svg>)/i.exec(text);
  const svg = fenced ? fenced[1] : bare ? bare[1] : null;
  if (!svg) return null;
  if (svg.length > 12_000) return null; // hard cap
  if (/<script|foreignObject|on[a-z]+\s*=/i.test(svg)) return null; // hygiene
  if (!svg.includes("xmlns")) return null; // must be standalone
  return svg;
}

/** Assembles the message list for a provider call. */
export function assembleMessages(options: {
  route: CopilotRoute | "visual";
  question: string;
  contextBlock: string | null;
  history?: ChatMessage[];
}): ChatMessage[] {
  const { route, question, contextBlock, history = [] } = options;

  let system: string;
  switch (route) {
    case "general":
      system = buildGeneralPrompt();
      break;
    case "data":
      system = buildDataPrompt(contextBlock ?? "");
      break;
    case "both":
      system = contextBlock
        ? buildBothPrompt(contextBlock)
        : buildGeneralPrompt(); // defensive: no data → degrade honestly
      break;
    case "visual":
      system = buildVisualPrompt(question, contextBlock);
      break;
  }

  // Keep history lean: last 8 turns maximum.
  return [
    { role: "system", content: system },
    ...history.slice(-8),
    { role: "user", content: question },
  ];
}

/** Wraps a raw model reply with the reasoning-artifact stripper applied. */
export function cleanAnswer(text: string): string {
  return stripReasoningArtifacts(text);
}
