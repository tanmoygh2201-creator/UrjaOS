"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  BatteryCharging,
  Check,
  Copy,
  Eraser,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Sun,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askCopilotAction } from "@/app/actions/copilot";
import {
  DATA_SUGGESTIONS,
  GENERAL_SUGGESTIONS,
  SUGGESTED_QUESTIONS,
} from "@/lib/validation/copilot";
import { MarkdownAnswer } from "@/components/copilot/markdown-answer";

interface CopilotChatProps {
  systems: { id: string; name: string }[];
  initialSystemId: string;
}

type CopilotRoute = "general" | "data" | "both" | "visual";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  /** Server-decided route for assistant answers (mode badge). */
  route?: CopilotRoute;
  /** Renderable SVG for visual answers. */
  svg?: string;
  /** Raster illustration from the configured image provider (visual answers). */
  image?: { dataUrl: string; label: string; note: string };
  /** Ask parameters captured for retry/regenerate. */
  ask?: { question: string; mode: "auto" | "data"; visual: boolean };
}

const ROUTE_BADGES: Record<CopilotRoute, { label: string; className: string }> = {
  general: {
    label: "General AI",
    className: "bg-ring/15 text-ring ring-ring/30",
  },
  data: {
    label: "UrjaOS data analysis",
    className: "bg-energy-green/15 text-energy-green ring-energy-green/30",
  },
  both: {
    label: "UrjaOS data + knowledge",
    className: "bg-primary/15 text-primary ring-primary/30",
  },
  visual: {
    label: "Visual explanation",
    className: "bg-chart-4/15 text-chart-4 ring-chart-4/30",
  },
};

/** Mode chip shown above an assistant bubble. */
function RouteBadge({ route }: { route: CopilotRoute }) {
  const badge = ROUTE_BADGES[route];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${badge.className}`}
    >
      {route === "visual" ? (
        <ImageIcon className="size-3" aria-hidden="true" />
      ) : route === "general" ? (
        <Sparkles className="size-3" aria-hidden="true" />
      ) : (
        <Zap className="size-3" aria-hidden="true" />
      )}
      {badge.label}
    </span>
  );
}

/**
 * The Copilot's replying agent: an animated sun.
 *
 * Rays spin slowly at rest and much faster while thinking, with a soft
 * pulsing glow behind. Error answers swap the sun for a warning triangle.
 */
function CopilotAvatar({
  variant,
  thinking = false,
}: {
  variant: "sun" | "error" | "user";
  thinking?: boolean;
}) {
  if (variant === "user") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-secondary to-secondary/70 text-secondary-foreground ring-1 ring-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)]">
        <User className="size-4" aria-hidden="true" />
      </span>
    );
  }
  if (variant === "error") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-destructive/20 to-destructive/10 text-destructive ring-1 ring-destructive/25 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
        <AlertTriangle className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={`relative flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 via-yellow-300 to-orange-400 ring-1 ring-amber-500/30 shadow-[0_2px_6px_rgba(245,158,11,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] ${
        thinking ? "animate-pulse" : ""
      }`}
    >
      <span
        className="absolute inset-0 rounded-full bg-amber-400/40 blur-[3px]"
        aria-hidden="true"
      />
      <Sun
        className={`relative size-[18px] text-orange-600 animate-spin ${
          thinking ? "[animation-duration:1.6s]" : "[animation-duration:14s]"
        }`}
        aria-hidden="true"
      />
    </span>
  );
}

/** Bubble surface with 3D depth: gradient, layered shadow, inner highlight, tail. */
function bubbleClasses(role: "user" | "assistant", isError: boolean): string {
  const base =
    "relative max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm before:absolute before:top-3 before:size-2.5 before:rotate-45 before:rounded-[2px]";
  if (role === "user") {
    return `${base} before:-right-1 before:bg-primary/90 bg-gradient-to-b from-primary to-primary/85 text-primary-foreground ring-1 ring-primary/25 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_14px_-4px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.25)]`;
  }
  if (isError) {
    return `${base} before:-left-1 before:bg-destructive/10 bg-gradient-to-b from-destructive/15 to-destructive/5 text-destructive ring-1 ring-destructive/20 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_5px_12px_-4px_rgba(0,0,0,0.12)]`;
  }
  return `${base} before:-left-1 before:bg-muted/70 bg-gradient-to-b from-background to-muted/50 text-foreground ring-1 ring-border/50 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_5px_12px_-4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)]`;
}

/** Renders a server-sanitized SVG diagram with a copy-source action. */
function SvgAnswer({ svg }: { svg: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div
        className="overflow-hidden rounded-lg ring-1 ring-border/60 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        // The SVG is produced server-side and sanitized (extractSvgBlock /
        // buildEnergyFlowSvg): no scripts, handlers, or foreignObject.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(svg);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard unavailable — ignore */
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
        {copied ? "Copied" : "Copy SVG"}
      </button>
    </div>
  );
}

/** Per-message action row (assistant answers only). */
function MessageActions({
  entry,
  isLast,
  onRegenerate,
}: {
  entry: ChatEntry;
  isLast: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (entry.isError || entry.role !== "assistant") return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 pl-1">
      <button
        type="button"
        aria-label="Copy response"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(entry.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard unavailable — ignore */
          }
        }}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
      {isLast ? (
        <button
          type="button"
          aria-label="Regenerate response"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Regenerate
        </button>
      ) : null}
    </div>
  );
}

/** Grounded + general chat over the user's assistant (Copilot upgrade). */
export function CopilotChat({ systems, initialSystemId }: CopilotChatProps) {
  const [systemId, setSystemId] = useState(initialSystemId);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [dataMode, setDataMode] = useState(false); // "Ask About My Energy System"
  const [visualArmed, setVisualArmed] = useState(false); // "Generate Visual" (one-shot)
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll whenever the conversation changes shape.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  /** History for continuity: last 8 clean turns. */
  const history = useMemo(
    () =>
      messages
        .filter((m) => !m.isError && m.content.length > 0)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  function runAsk(
    text: string,
    options: { mode: "auto" | "data"; visual: boolean; appendUser: boolean }
  ) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    const { mode, visual, appendUser } = options;

    setQuestion("");
    setMessages((prev) => {
      const next = appendUser ? [...prev, { role: "user" as const, content: trimmed }] : [...prev];
      next.push({
        role: "assistant",
        content: "",
        route: visual ? "visual" : undefined,
        ask: { question: trimmed, mode, visual },
      });
      return next;
    });

    const formData = new FormData();
    formData.set("question", trimmed);
    formData.set("systemId", systemId);
    formData.set("mode", mode);
    formData.set("visual", String(visual));
    formData.set("history", JSON.stringify(history));

    startTransition(async () => {
      const result = await askCopilotAction(formData);
      setMessages((prev) => {
        const next = [...prev];
        const placeholderIndex = next.findIndex(
          (m) => m.role === "assistant" && m.content === "" && !m.isError
        );
        const resolved: ChatEntry = result.ok
          ? {
              role: "assistant",
              content: result.answer ?? "",
              route: result.route,
              svg: result.svg ?? undefined,
              image: result.image ?? undefined,
            }
          : {
              role: "assistant",
              content: result.error ?? "Something went wrong — please try again.",
              isError: true,
              ask: { question: trimmed, mode, visual },
            };
        if (placeholderIndex >= 0) next[placeholderIndex] = resolved;
        else next.push(resolved);
        return next;
      });
    });
  }

  function ask(text: string) {
    const visual = visualArmed;
    setVisualArmed(false); // one-shot
    runAsk(text, { mode: dataMode ? "data" : "auto", visual, appendUser: true });
  }

  /** Re-runs a captured ask after removing its failed/last answer. */
  function rerun(entryIndex: number) {
    if (pending) return;
    setMessages((prev) => {
      const entry = prev[entryIndex];
      if (!entry?.ask) return prev;
      const withoutAnswer = prev.filter((_, i) => i !== entryIndex);
      // Re-issue without duplicating the user bubble.
      setTimeout(
        () =>
          runAsk(entry.ask!.question, {
            mode: entry.ask!.mode,
            visual: entry.ask!.visual,
            appendUser: false,
          }),
        0
      );
      return withoutAnswer;
    });
  }

  const showDataSuggestions = dataMode || messages.some((m) => m.route === "data" || m.route === "both");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="copilot-system" className="text-sm text-muted-foreground">
          Ask about
        </label>
        <select
          id="copilot-system"
          value={systemId}
          onChange={(event) => setSystemId(event.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
        >
          {systems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => {
              if (pending) return;
              setMessages([]);
            }}
          >
            <Eraser data-icon="inline-start" />
            Clear chat
          </Button>
        ) : null}
      </div>

      <div
        className="flex max-h-[520px] min-h-72 flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-card p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
            <CopilotAvatar variant="sun" />
            <p className="max-w-md text-sm text-muted-foreground">
              Ask anything — general energy knowledge, science, code, math — or
              switch on <strong className="text-foreground">Energy-System mode</strong> to
              analyze your real readings. Data answers come only from your
              actual UrjaOS data; nothing is invented.
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isPlaceholder = pending && message.role === "assistant" && message.content === "";
            if (isPlaceholder) return null; // the dedicated thinking bubble covers this
            return (
              <div
                key={index}
                className={`flex items-start gap-2.5 animate-in fade-in duration-300 ${
                  message.role === "user"
                    ? "flex-row-reverse slide-in-from-right-2"
                    : "slide-in-from-bottom-2"
                }`}
              >
                <CopilotAvatar
                  variant={
                    message.role === "user" ? "user" : message.isError ? "error" : "sun"
                  }
                />
                <div className="flex max-w-[85%] flex-col">
                  {message.role === "assistant" && message.route && !message.isError ? (
                    <div className="mb-1">
                      <RouteBadge route={message.route} />
                    </div>
                  ) : null}
                  <div className={bubbleClasses(message.role, Boolean(message.isError))}>
                    {message.role === "assistant" && !message.isError ? (
                      <div className="space-y-2">
                        {message.svg ? <SvgAnswer svg={message.svg} /> : null}
                        {message.image ? (
                          <figure className="overflow-hidden rounded-lg ring-1 ring-border/60">
                            {/* Server-supplied data URL from the configured image provider (never a user-controlled source). next/image cannot optimize data URLs. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={message.image.dataUrl}
                              alt={message.image.label}
                              className="block h-auto w-full"
                              loading="lazy"
                            />
                            <figcaption className="flex items-start gap-1.5 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
                              <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                              {message.image.note}
                            </figcaption>
                          </figure>
                        ) : null}
                        {message.content ? (
                          <MarkdownAnswer content={message.content} />
                        ) : null}
                      </div>
                    ) : (
                      message.content
                    )}
                    {message.isError && message.ask ? (
                      <button
                        type="button"
                        onClick={() => rerun(index)}
                        disabled={pending}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                      >
                        <RefreshCw className="size-3" aria-hidden="true" />
                        Retry
                      </button>
                    ) : null}
                  </div>
                  {message.role === "assistant" ? (
                    <MessageActions
                      entry={message}
                      isLast={index === messages.length - 1}
                      onRegenerate={() => rerun(index)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        {pending ? (
          <div
            className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300"
            role="status"
            aria-label="Copilot is thinking"
          >
            <CopilotAvatar variant="sun" thinking />
            <div className="relative rounded-2xl bg-gradient-to-b from-background to-muted/50 ring-1 ring-border/50 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_5px_12px_-4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] before:absolute before:top-3 before:-left-1 before:size-2.5 before:rotate-45 before:rounded-[2px] before:bg-muted/70 px-4 py-3.5">
              <div className="flex items-center gap-1.5">
                <span className="size-2 animate-pulse rounded-full bg-amber-500/70" />
                <span className="size-2 animate-pulse rounded-full bg-amber-500/70 [animation-delay:200ms]" />
                <span className="size-2 animate-pulse rounded-full bg-amber-500/70 [animation-delay:400ms]" />
              </div>
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDataMode((v) => !v)}
          aria-pressed={dataMode}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all ${
            dataMode
              ? "bg-energy-green/20 text-energy-green ring-energy-green/40 shadow-[0_0_16px_-4px] shadow-energy-green/40"
              : "border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <BatteryCharging className="size-3.5" aria-hidden="true" />
          {dataMode ? "Energy-System mode: ON" : "Ask About My Energy System"}
        </button>
        <button
          type="button"
          onClick={() => setVisualArmed((v) => !v)}
          aria-pressed={visualArmed}
          disabled={pending}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all disabled:opacity-50 ${
            visualArmed
              ? "bg-chart-4/20 text-chart-4 ring-chart-4/40 shadow-[0_0_16px_-4px] shadow-chart-4/40"
              : "border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <ImageIcon className="size-3.5" aria-hidden="true" />
          {visualArmed ? "Describe the visual to generate…" : "Generate Visual"}
        </button>
      </div>

      {/* Contextual suggested prompts — sent on click. */}
      <div className="flex flex-wrap gap-1.5">
        {(showDataSuggestions ? DATA_SUGGESTIONS : GENERAL_SUGGESTIONS).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => ask(suggestion)}
            disabled={pending}
            className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
        {!showDataSuggestions
          ? SUGGESTED_QUESTIONS.slice(0, 2).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setDataMode(true);
                  setVisualArmed(false);
                  // Send in data mode directly.
                  runAsk(suggestion, { mode: "data", visual: false, appendUser: true });
                }}
                disabled={pending}
                className="rounded-full border border-energy-green/30 px-3 py-1 text-xs text-energy-green/90 transition-colors hover:bg-energy-green/10 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))
          : null}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            visualArmed
              ? "e.g. Explain how MPPT works — as a diagram"
              : dataMode
                ? "Ask about your solar, battery, consumption…"
                : "Ask anything — energy, science, code, math…"
          }
          maxLength={500}
          disabled={pending}
          aria-label="Ask the copilot"
        />
        <Button type="submit" size="icon" disabled={pending || question.trim().length < 3}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Send aria-hidden="true" />
          )}
          <span className="sr-only">Send question</span>
        </Button>
      </form>
    </div>
  );
}
