"use server";

import { createClient } from "@/lib/supabase/server";
import {
  copilotAskSchema,
} from "@/lib/validation/copilot";
import { fieldErrors } from "@/lib/validation/auth";
import {
  buildCopilotContext,
  loadCopilotContext,
} from "@/lib/ai/context";
import { classifyQuestion } from "@/lib/ai/routing";
import {
  assembleMessages,
  buildVisualImagePrompt,
  cleanAnswer,
  extractSvgBlock,
} from "@/lib/ai/prompts";
import {
  buildEnergyFlowSvg,
  isEnergyFlowRequest,
  RASTER_IMAGE_NOTE,
  resolveImageProvider,
} from "@/lib/ai/visuals";
import {
  callChatCompletion,
  ProviderError,
  resolveProviderConfig,
  type ChatMessage,
} from "@/lib/ai/provider";
import type { EnergySystem } from "@/types/energy";

export interface AskCopilotResult {
  ok: boolean;
  error?: string;
  answer?: string;
  /** Renderable SVG when the request was a visual request. */
  svg?: string | null;
  /** Raster illustration from the configured image provider (visual requests only). */
  image?: { dataUrl: string; label: string; note: string } | null;
  /** The route the router chose — surfaced in the UI as a mode badge. */
  route?: "general" | "data" | "both" | "visual";
  /** When true, the UI should point the user at env setup. */
  notConfigured?: boolean;
}

/** Per-user sliding-window rate limit (in-memory; fine for a college V1). */
const RATE_LIMIT = { max: 10, windowMs: 5 * 60_000 };
const rateBuckets = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(userId) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT.windowMs
  );
  if (bucket.length >= RATE_LIMIT.max) {
    rateBuckets.set(userId, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(userId, bucket);
  return true;
}

function mapProviderError(error: ProviderError): string {
  switch (error.kind) {
    case "rate_limit":
      return "The AI service is rate-limiting us right now — try again in a moment.";
    case "overloaded":
      return "The AI service is busy — try again shortly.";
    case "network":
      return "Could not reach the AI service (or it timed out). Check the connection and try again.";
    case "auth":
      return "The AI API key was rejected — check AI_API_KEY on the server.";
    case "bad_response":
      return "The AI service returned something unreadable — try rephrasing your question.";
    case "not_configured":
      return "AI is not configured on this server yet.";
  }
}

export async function askCopilotAction(
  formData: FormData
): Promise<AskCopilotResult> {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // 2. Input validation (question + mode + optional history).
  // History travels as a JSON string in FormData; decode it before schema
  // validation (zod validates arrays, not their serialized form).
  let historyDecoded: unknown;
  const historyRaw = formData.get("history");
  if (typeof historyRaw === "string" && historyRaw.length > 0) {
    try {
      historyDecoded = JSON.parse(historyRaw);
    } catch {
      historyDecoded = undefined; // malformed history → treat as absent
    }
  }
  const parsed = copilotAskSchema.safeParse({
    question: formData.get("question"),
    mode: formData.get("mode") ?? undefined,
    visual: formData.get("visual") ?? undefined,
    history: historyDecoded,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(fieldErrors(parsed.error))[0] ?? "Invalid question.",
    };
  }
  const { question, mode, visual } = parsed.data;
  const history: ChatMessage[] = parsed.data.history ?? [];

  // 3. Rate limit (one question = one provider call; visual included).
  if (!checkRateLimit(user.id)) {
    return {
      ok: false,
      error: "You are asking quickly — wait a couple of minutes and try again.",
    };
  }

  // 4. Provider configuration (server-side key only).
  const config = resolveProviderConfig();
  if (!config) {
    return { ok: false, notConfigured: true, error: "AI is not configured on this server yet." };
  }

  // 5. Smart routing — decided BEFORE any data fetch, so general chat
  //    costs nothing extra and stays fast.
  const decision = classifyQuestion(question, mode);
  const needsContext = decision.route !== "general";

  // 6. Ownership-verified system — required whenever grounding is needed.
  let system: EnergySystem | null = null;
  const systemId = String(formData.get("systemId") ?? "");
  if (needsContext || decision.route !== "general") {
    if (!systemId) {
      return { ok: false, error: "Select a system first." };
    }
    const { data: systemRow } = await supabase
      .from("energy_systems")
      .select("*")
      .eq("id", systemId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!systemRow) return { ok: false, error: "System not found." };
    system = systemRow as EnergySystem;
  }

  // 7. Grounding context — only fetched for data/both routes (never for
  //    general chat, so the assistant stays a fast, cheap chatbot there).
  //    The parsed input is retained for the deterministic data-visual path.
  let contextBlock: string | null = null;
  let contextInput: Awaited<ReturnType<typeof loadCopilotContext>> | null = null;
  if (system) {
    contextInput = await loadCopilotContext(supabase, system);
    contextBlock = buildCopilotContext(contextInput);
  }

  // 8. Messages from the route-specific prompt + trimmed history.
  const route = visual ? ("visual" as const) : decision.route;

  // 8b. Data-flow visuals are rendered deterministically from the user's
  //     REAL readings — no model call at all, so nothing can be invented.
  //     (Concept visuals below go through the model/image providers.)
  if (route === "visual" && isEnergyFlowRequest(question) && contextInput?.analytics?.hasData) {
    const a = contextInput.analytics;
    const svg = buildEnergyFlowSvg({
      systemName: contextInput.system.name,
      solarKwh: a.solarKwh,
      consumptionKwh: a.consumptionKwh,
      gridImportKwh: a.gridImportKwh,
      gridExportKwh: a.gridExportKwh,
      batteryChargeKwh: a.batteryChargeKwh,
      batteryDischargeKwh: a.batteryDischargeKwh,
    });
    return {
      ok: true,
      answer: `Energy flow for ${contextInput.system.name} — drawn from your actual readings for the period.`,
      svg,
      route,
    };
  }

  const messages = assembleMessages({ route, question, contextBlock, history });

  // 9. Provider call with safe error mapping. Visual requests get a bigger
  // token budget (SVG is token-hungry — every attribute costs tokens, and a
  // tight cap truncates mid-<svg>) and a longer timeout (diagrams take 2-3
  // minutes token-by-token on reasoning-style models).
  try {
    const raw = await callChatCompletion(
      route === "visual" ? { ...config, maxTokens: 8000 } : config,
      messages,
      fetch,
      route === "visual" ? 180_000 : 90_000
    );
    // Visual route: the SVG block IS the deliverable — extract it from the
    // RAW reply (reasoning-style models often wrap it in their thinking
    // block, which the text cleaner would otherwise discard). When an image
    // endpoint is configured (AI_IMAGE_*), a concept illustration is also
    // generated; failures there degrade honestly to SVG-only.
    if (route === "visual") {
      const svg = extractSvgBlock(raw);
      if (!svg) {
        return {
          ok: false,
          route,
          error:
            "The model could not produce a valid diagram for this request — try rephrasing, or ask a text explanation instead.",
        };
      }

      // Best-effort prose intro: reasoning stripped, code fences removed.
      const intro = cleanAnswer(raw.replace(/```[\s\S]*?```/g, ""));

      // Raster illustration from the modular image provider (env-selected).
      // Only attempted for concept visuals — data visuals come from real
      // readings and must stay deterministic (see step 6/7 and prompts).
      const imagePrompt = buildVisualImagePrompt(question, contextBlock === null);
      const imageProvider = resolveImageProvider();
      const result: { ok: true; answer?: string; svg: string; route: "visual"; image?: { dataUrl: string; label: string; note: string } } = {
        ok: true,
        answer: intro,
        svg,
        route,
      };
      if (imageProvider.available) {
        try {
          const img = await imageProvider.generate(imagePrompt);
          if (img.dataUrl) {
            result.image = { dataUrl: img.dataUrl, label: imageProvider.label, note: RASTER_IMAGE_NOTE };
          }
          // img.error intentionally ignored: raster is a bonus, SVG is the
          // deliverable, and a raster failure must not fail the request.
        } catch {
          // Same: raster is best-effort only.
        }
      }
      return result;
    }

    const answer = cleanAnswer(raw);
    return { ok: true, answer, route };
  } catch (error) {
    if (error instanceof ProviderError) {
      return { ok: false, route, error: mapProviderError(error) };
    }
    return { ok: false, route, error: "Something went wrong — please try again." };
  }
}
