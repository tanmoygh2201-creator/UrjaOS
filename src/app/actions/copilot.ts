"use server";

import { createClient } from "@/lib/supabase/server";
import { copilotQuestionSchema } from "@/lib/validation/copilot";
import { fieldErrors } from "@/lib/validation/auth";
import {
  buildCopilotContext,
  buildSystemPrompt,
  loadCopilotContext,
} from "@/lib/ai/context";
import {
  callChatCompletion,
  ProviderError,
  resolveProviderConfig,
} from "@/lib/ai/provider";
import type { EnergySystem } from "@/types/energy";

export interface AskCopilotResult {
  ok: boolean;
  error?: string;
  answer?: string;
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
      return "Could not reach the AI service. Check the connection and try again.";
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
  // 1. Auth + ownership.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // 2. Input validation.
  const parsed = copilotQuestionSchema.safeParse({
    question: formData.get("question"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(fieldErrors(parsed.error))[0] ?? "Invalid question.",
    };
  }

  // 3. Rate limit.
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

  // 5. Ownership-verified system.
  const systemId = String(formData.get("systemId") ?? "");
  if (!systemId) return { ok: false, error: "Select a system first." };
  const { data: systemRow } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", systemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!systemRow) return { ok: false, error: "System not found." };
  const system = systemRow as EnergySystem;

  // 6. Grounding context from the same services the pages use.
  const contextInput = await loadCopilotContext(supabase, system);
  const contextBlock = buildCopilotContext(contextInput);
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(contextBlock) },
    { role: "user" as const, content: parsed.data.question },
  ];

  // 7. Provider call with safe error mapping.
  try {
    const answer = await callChatCompletion(config, messages);
    return { ok: true, answer };
  } catch (error) {
    if (error instanceof ProviderError) {
      return { ok: false, error: mapProviderError(error) };
    }
    return { ok: false, error: "Something went wrong — please try again." };
  }
}
