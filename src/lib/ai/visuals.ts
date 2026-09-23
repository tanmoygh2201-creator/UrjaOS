/**
 * Visual layer for the Copilot (modular image-generation architecture).
 *
 * Three honest paths:
 *  1. CONCEPT / EXPLAINER visuals: the configured chat model is asked for an
 *     SVG diagram (works with ANY OpenAI-compatible chat endpoint — no image
 *     API required). The SVG is sanitized before render.
 *  2. SYSTEM-DATA visuals: charts/diagrams drawn directly from the user's
 *     real UrjaOS numbers by `buildEnergyFlowSvg` — never model-invented.
 *  3. RASTER visuals: when AI_IMAGE_* env points at an OpenAI-compatible
 *     images endpoint, `resolveImageProvider` returns a real provider and
 *     visual requests also produce a concept illustration (data URL). With
 *     no image env configured the no-op provider reports unavailable —
 *     nothing here pretends a model "drew" anything it did not.
 */

import { ProviderError } from "@/lib/ai/provider";

/** Modular image-provider hook: real raster generation plugs in here. */
export interface ImageProvider {
  /** True when this provider can actually generate raster images. */
  readonly available: boolean;
  /** Model/endpoint identifier for honest UI hints (never shown as data). */
  readonly label: string;
  generate(
    prompt: string,
    fetchImpl?: typeof fetch
  ): Promise<{ kind: "image"; dataUrl?: string; error?: string }>;
}

/**
 * No-op image provider: the honest default. Reports unavailable so the UI
 * never claims an AI image was generated when it was not. The env-selected
 * OpenAI-compatible provider below implements the same interface and is
 * chosen automatically when AI_IMAGE_* is configured.
 */
export const nullImageProvider: ImageProvider = {
  available: false,
  label: "none",
  async generate() {
    return {
      kind: "image" as const,
      error: "Image generation is not available with the currently configured AI provider.",
    };
  },
};

/** Env-selected image provider config (all server-side; never shipped to the client). */
export interface ImageProviderConfig {
  apiKey: string;
  model: string;
  /** OpenAI-compatible images base URL (no trailing slash). */
  baseUrl: string;
  size: string;
}

export const IMAGE_PROVIDER_DEFAULTS = {
  model: "gpt-image-1",
  size: "1024x1024",
  /** Raster generation is slow (10-60s+); generous but bounded. */
  timeoutMs: 120_000,
  /** Refuse to inline images larger than this (base64 balloons memory). */
  maxBytes: 8 * 1024 * 1024,
} as const;

/**
 * Resolves image-provider config from env; null unless BOTH the endpoint and
 * the key are set. Any OpenAI-compatible images server works by pointing
 * AI_IMAGE_BASE_URL at it — no code changes, same as the chat provider.
 */
export function resolveImageProviderConfig(
  env: Record<string, string | undefined> = process.env
): ImageProviderConfig | null {
  const baseUrl = (env.AI_IMAGE_BASE_URL ?? "").trim();
  const apiKey = (env.AI_IMAGE_API_KEY ?? "").trim();
  if (baseUrl.length === 0 || apiKey.length === 0) return null;
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: (env.AI_IMAGE_MODEL ?? "").trim() || IMAGE_PROVIDER_DEFAULTS.model,
    size: (env.AI_IMAGE_SIZE ?? "").trim() || IMAGE_PROVIDER_DEFAULTS.size,
  };
}

/** Builds the request for an OpenAI-compatible images endpoint (pure). */
export function buildImageRequest(
  config: ImageProviderConfig,
  prompt: string
): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  return {
    url: `${config.baseUrl}/images/generations`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      prompt: prompt.trim(),
      n: 1,
      size: config.size,
    },
  };
}

/**
 * Parses an images/generations payload. Accepts `b64_json` (preferred) or a
 * temporary `url` — gpt-image-1 always returns b64; dall-e-style endpoints
 * default to url. Throws ProviderError(bad_response) on anything unreadable.
 */
export function parseImageResponse(payload: unknown): { b64?: string; url?: string } {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    const rows = (payload as { data: unknown }).data;
    const first = Array.isArray(rows) ? rows[0] : undefined;
    if (typeof first === "object" && first !== null) {
      const b64 = (first as { b64_json?: unknown }).b64_json;
      const url = (first as { url?: unknown }).url;
      if (typeof b64 === "string" && b64.length > 0) return { b64 };
      if (typeof url === "string" && url.length > 0 && /^https?:\/\//i.test(url)) {
        return { url };
      }
    }
  }
  throw new ProviderError("bad_response", "The image service returned an unreadable response.");
}

/** Infers a safe MIME type from base64 magic bytes (png/jpeg/gif/webp). */
export function sniffImageMime(b64: string): string {
  const head = b64.slice(0, 16);
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lGOD")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  return "image/png"; // OpenAI-compatible endpoints emit PNG by default
}

/** Honest prose shipped with a raster image — never claims a fake origin. */
export const RASTER_IMAGE_NOTE =
  "Generated with the configured image model — a concept illustration, not measured data. " +
  "Data-driven diagrams in this chat are always drawn from your real UrjaOS readings.";

/**
 * Real image provider speaking the OpenAI `/images/generations` contract —
 * the de-facto compatible shape (OpenAI, Azure OpenAI, Together, local
 * gateways exposing the same route). Selected from env by
 * `resolveImageProvider`; never reports success for a call that failed.
 */
export class OpenAiCompatibleImageProvider implements ImageProvider {
  readonly available = true;
  readonly label: string;

  constructor(private readonly config: ImageProviderConfig) {
    this.label = config.model;
  }

  async generate(
    prompt: string,
    fetchImpl: typeof fetch = fetch
  ): Promise<{ kind: "image"; dataUrl?: string; error?: string }> {
    const { url, body, headers } = buildImageRequest(this.config, prompt);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(IMAGE_PROVIDER_DEFAULTS.timeoutMs),
      });
    } catch {
      return { kind: "image", error: "Could not reach the image service (or it timed out)." };
    }

    if (response.status === 401 || response.status === 403) {
      return { kind: "image", error: "The image service rejected the API key — check AI_IMAGE_API_KEY on the server." };
    }
    if (response.status === 429) {
      return { kind: "image", error: "The image service is rate-limiting requests — try again in a moment." };
    }
    if (response.status === 503 || response.status === 529) {
      return { kind: "image", error: "The image service is temporarily overloaded — try again shortly." };
    }
    if (!response.ok) {
      return { kind: "image", error: `The image service returned status ${response.status}.` };
    }

    try {
      const payload: unknown = await response.json().catch(() => null);
      const parsed = parseImageResponse(payload);

      // b64 → data URL directly. A temporary `url` is downloaded server-side
      // and inlined, so the chat never depends on a link that expires and the
      // browser never talks to the image provider.
      if (parsed.b64) {
        if (parsed.b64.length * 0.75 > IMAGE_PROVIDER_DEFAULTS.maxBytes) {
          return { kind: "image", error: "The generated image was too large to display." };
        }
        return { kind: "image", dataUrl: `data:${sniffImageMime(parsed.b64)};base64,${parsed.b64}` };
      }

      const asset = await fetchImpl(parsed.url as string, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!asset.ok) {
        return { kind: "image", error: "The generated image could not be downloaded — try again." };
      }
      const buf = await asset.arrayBuffer();
      if (buf.byteLength > IMAGE_PROVIDER_DEFAULTS.maxBytes) {
        return { kind: "image", error: "The generated image was too large to display." };
      }
      const b64 = Buffer.from(buf).toString("base64");
      const declared = asset.headers.get("content-type")?.split(";")[0] ?? "";
      const mime = /^image\/(png|jpeg|gif|webp)$/.test(declared)
        ? declared
        : sniffImageMime(b64);
      return { kind: "image", dataUrl: `data:${mime};base64,${b64}` };
    } catch (error) {
      if (error instanceof ProviderError) {
        return { kind: "image", error: "The image service returned an unreadable response." };
      }
      return { kind: "image", error: "Could not reach the image service (or it timed out)." };
    }
  }
}

/**
 * Resolves the image provider from env. Returns the no-op provider unless an
 * images endpoint is explicitly configured (AI_IMAGE_BASE_URL +
 * AI_IMAGE_API_KEY), so the UI never claims an AI image was generated when
 * it was not.
 */
export function resolveImageProvider(env: Record<string, string | undefined> = process.env): ImageProvider {
  const config = resolveImageProviderConfig(env);
  return config ? new OpenAiCompatibleImageProvider(config) : nullImageProvider;
}

/**
 * True when a visual request is asking to see the user's OWN energy flows
 * ("visualize my energy flow") rather than a general concept diagram.
 * Data-flow visuals are rendered deterministically from real readings;
 * everything else goes through the model/image providers.
 */
export function isEnergyFlowRequest(question: string): boolean {
  return /\b(energy|power)\s+flow\b|\bvisuali[sz]e\b.*\b(my|the)\s+(energy|system|flows?)\b|\bflow\s+diagram\b/i.test(
    question
  );
}

/** Shape of the UrjaOS context the energy-flow visualizer consumes. */
export interface EnergyFlowInput {
  systemName: string;
  solarKwh: number | null;
  consumptionKwh: number | null;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
}

/**
 * Builds a deterministic SVG energy-flow diagram from REAL system data.
 * Node sizes scale with the values; missing data renders as "n/a" — never
 * invented. Pure, so it is fully testable.
 */
export function buildEnergyFlowSvg(input: EnergyFlowInput): string {
  const fmt = (v: number | null) => (v === null ? "n/a" : `${v.toLocaleString()} kWh`);
  const scale = (v: number | null) => (v && v > 0 ? Math.max(1, Math.min(120, Math.sqrt(v) * 6)) : 4);

  const solarR = scale(input.solarKwh);
  const loadR = scale(input.consumptionKwh);
  const battR = scale(Math.max(input.batteryChargeKwh ?? 0, input.batteryDischargeKwh ?? 0));
  const gridR = scale(Math.max(input.gridImportKwh ?? 0, input.gridExportKwh ?? 0));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 420" width="100%">
  <rect width="760" height="420" fill="#0d1626"/>
  <text x="380" y="38" text-anchor="middle" fill="#e8edf5" font-family="system-ui, sans-serif" font-size="17" font-weight="600">${escapeXml(input.systemName)} — energy flow (period totals)</text>
  <text x="380" y="58" text-anchor="middle" fill="#8fa3bf" font-family="system-ui, sans-serif" font-size="12">Node size ∝ flow volume · drawn from your actual UrjaOS readings</text>

  <circle cx="150" cy="200" r="${solarR}" fill="#f5b31b" opacity="0.9"/>
  <text x="150" y="${200 - solarR - 12}" text-anchor="middle" fill="#f5b31b" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Solar</text>
  <text x="150" y="${200 + solarR + 20}" text-anchor="middle" fill="#e8edf5" font-family="system-ui, sans-serif" font-size="13">${fmt(input.solarKwh)}</text>

  <circle cx="430" cy="120" r="${battR}" fill="#34d399" opacity="0.9"/>
  <text x="430" y="${120 - battR - 12}" text-anchor="middle" fill="#34d399" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Battery</text>
  <text x="430" y="${120 + battR + 20}" text-anchor="middle" fill="#e8edf5" font-family="system-ui, sans-serif" font-size="13">${fmt(input.batteryChargeKwh)} in / ${fmt(input.batteryDischargeKwh)} out</text>

  <circle cx="430" cy="300" r="${loadR}" fill="#38bdf8" opacity="0.9"/>
  <text x="430" y="${300 - loadR - 12}" text-anchor="middle" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Consumption</text>
  <text x="430" y="${300 + loadR + 20}" text-anchor="middle" fill="#e8edf5" font-family="system-ui, sans-serif" font-size="13">${fmt(input.consumptionKwh)}</text>

  <circle cx="640" cy="200" r="${gridR}" fill="#94a3b8" opacity="0.9"/>
  <text x="640" y="${200 - gridR - 12}" text-anchor="middle" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Grid</text>
  <text x="640" y="${200 + gridR + 20}" text-anchor="middle" fill="#e8edf5" font-family="system-ui, sans-serif" font-size="13">import ${fmt(input.gridImportKwh)} / export ${fmt(input.gridExportKwh)}</text>

  <g stroke="#5b7290" stroke-width="2" fill="none" opacity="0.75">
    <line x1="${150 + solarR}" y1="200" x2="${430 - battR}" y2="120"/>
    <line x1="${150 + solarR}" y1="200" x2="${430 - loadR}" y2="300"/>
    <line x1="${150 + solarR}" y1="200" x2="${640 - gridR}" y2="200"/>
    <line x1="${430 + battR}" y1="120" x2="${430 - loadR}" y2="300" stroke-dasharray="4 4"/>
  </g>
</svg>`;
}

/** Escapes XML-significant characters for safe SVG text nodes. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
