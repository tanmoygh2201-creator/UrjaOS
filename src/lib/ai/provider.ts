/**
 * AI provider layer (spec §39).
 *
 * The API key NEVER leaves the server: this module is imported only by
 * server code (the ask action), and the key is read from `process.env` at
 * call time. The provider is OpenAI-compatible chat completions over plain
 * `fetch` — no SDK, no extra dependency — so any compatible endpoint
 * (OpenAI, Groq, OpenRouter, vLLM, …) works by changing the base URL.
 *
 * Pure helpers (buildChatRequest / parseChatResponse) are exported for
 * testing without any network I/O.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL (no trailing slash). */
  baseUrl: string;
  temperature: number;
  maxTokens: number;
}

export class ProviderError extends Error {
  /** Machine-readable reason for the action layer to map to UI copy. */
  kind:
    | "not_configured"
    | "auth"
    | "rate_limit"
    | "overloaded"
    | "network"
    | "bad_response";
  constructor(kind: ProviderError["kind"], message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

/** Minimal env shape the provider layer needs (testable without process.env). */
export type ProviderEnv = Record<string, string | undefined>;

/**
 * Provider presets: OpenAI-compatible base URLs + a sensible default model.
 * All of them speak the same `/chat/completions` contract, so the request
 * builder below never changes — only this table does.
 */
const PROVIDER_PRESETS: Record<
  string,
  { baseUrl: string; model: string }
> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  // NVIDIA NIM (build.nvidia.com) — `nvapi-…` keys. Catalog models retire
  // often (llama-3.1-8b died 2026-08-26); the default below is verified
  // serving, and AI_MODEL overrides it without code changes.
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "openai/gpt-oss-20b",
  },
};

/** Resolves provider config from env. Returns null when not configured. */
export function resolveProviderConfig(
  env: ProviderEnv = process.env
): ProviderConfig | null {
  const apiKey = (env.AI_API_KEY ?? "").trim();
  if (apiKey.length === 0) return null;

  // Tolerant parsing: " nvidia " or '"nvidia"' (quote-pasted values) resolve
  // the same as nvidia.
  const rawProvider = (env.AI_PROVIDER ?? "openai").trim();
  const provider =
    rawProvider.length >= 2 &&
    ((rawProvider.startsWith('"') && rawProvider.endsWith('"')) ||
      (rawProvider.startsWith("'") && rawProvider.endsWith("'")))
      ? rawProvider.slice(1, -1).trim().toLowerCase()
      : rawProvider.toLowerCase();

  const preset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.openai;

  // Optional overrides so any compatible endpoint/model works without code
  // changes (e.g. a specific NIM catalog model via AI_MODEL).
  const baseUrl = (env.AI_BASE_URL ?? "").trim() || preset.baseUrl;
  const model = (env.AI_MODEL ?? "").trim() || preset.model;

  return {
    apiKey,
    model,
    baseUrl,
    temperature: 0.3,
    // Generous budget: reasoning-style models (e.g. gpt-oss on NVIDIA NIM)
    // spend tokens thinking before the visible answer, so a tight cap yields
    // an empty `content` and an unreadable-response error.
    maxTokens: 1000,
  };
}

/** Builds the request body + URL for a chat completion (pure). */
export function buildChatRequest(
  config: ProviderConfig,
  messages: ChatMessage[]
): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  return {
    url: `${config.baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    },
  };
}

/** Parses a successful chat-completions response body (pure). */
export function parseChatResponse(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "choices" in payload &&
    Array.isArray((payload as { choices: unknown }).choices) &&
    (payload as { choices: unknown[] }).choices.length > 0
  ) {
    const first = (payload as { choices: unknown[] }).choices[0];
    if (
      typeof first === "object" &&
      first !== null &&
      "message" in first &&
      typeof (first as { message: { content?: unknown } }).message?.content ===
        "string"
    ) {
      const content = (first as { message: { content: string } }).message.content;
      const trimmed = content.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  throw new ProviderError("bad_response", "The AI service returned an unreadable response.");
}

/**
 * Calls the chat-completions endpoint. Throws ProviderError with a kind the
 * action layer maps to safe UI messages.
 */
export async function callChatCompletion(
  config: ProviderConfig,
  messages: ChatMessage[],
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const { url, body, headers } = buildChatRequest(config, messages);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError("network", "Could not reach the AI service.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("auth", "The AI service rejected the API key.");
  }
  if (response.status === 429) {
    throw new ProviderError("rate_limit", "The AI service is rate-limiting requests.");
  }
  if (response.status === 503 || response.status === 529) {
    throw new ProviderError("overloaded", "The AI service is temporarily overloaded.");
  }
  if (!response.ok) {
    throw new ProviderError(
      "bad_response",
      `The AI service returned status ${response.status}.`
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  return parseChatResponse(payload);
}
