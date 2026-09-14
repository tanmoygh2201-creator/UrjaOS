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

/** Resolves provider config from env. Returns null when not configured. */
export function resolveProviderConfig(
  env: ProviderEnv = process.env
): ProviderConfig | null {
  const apiKey = (env.AI_API_KEY ?? "").trim();
  if (apiKey.length === 0) return null;

  const provider = (env.AI_PROVIDER ?? "openai").trim().toLowerCase();
  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://api.openai.com/v1";

  const model =
    provider === "groq"
      ? "llama-3.1-8b-instant"
      : provider === "openrouter"
        ? "openai/gpt-4o-mini"
        : "gpt-4o-mini";

  return {
    apiKey,
    model,
    baseUrl,
    temperature: 0.3,
    maxTokens: 700,
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
