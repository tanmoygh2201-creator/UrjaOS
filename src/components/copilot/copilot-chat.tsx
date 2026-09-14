"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Send, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askCopilotAction } from "@/app/actions/copilot";
import { SUGGESTED_QUESTIONS } from "@/lib/validation/copilot";
import { MarkdownAnswer } from "@/components/copilot/markdown-answer";

interface CopilotChatProps {
  systems: { id: string; name: string }[];
  initialSystemId: string;
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
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

/** Grounded chat over the user's own system data (spec §41). */
export function CopilotChat({ systems, initialSystemId }: CopilotChatProps) {
  const [systemId, setSystemId] = useState(initialSystemId);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    );

    const formData = new FormData();
    formData.set("question", trimmed);
    formData.set("systemId", systemId);

    startTransition(async () => {
      const result = await askCopilotAction(formData);
      setMessages((prev) => {
        const next = [...prev];
        if (result.ok && result.answer) {
          next.push({ role: "assistant", content: result.answer });
        } else {
          next.push({
            role: "assistant",
            content:
              result.error ??
              "Something went wrong — please try again.",
            isError: true,
          });
        }
        return next;
      });
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      );
    });
  }

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
      </div>

      <div
        className="flex max-h-[480px] min-h-64 flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-card p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <CopilotAvatar variant="sun" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask anything about this system — the Copilot answers only from
              your real readings, forecasts, and plans. No data, no answer.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
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
                  message.role === "user"
                    ? "user"
                    : message.isError
                      ? "error"
                      : "sun"
                }
              />
              <div className={bubbleClasses(message.role, Boolean(message.isError))}>
                {message.role === "assistant" && !message.isError ? (
                  <MarkdownAnswer content={message.content} />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))
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

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setQuestion(suggestion)}
            disabled={pending}
            className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
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
          placeholder="e.g. How can I reduce my bill next month?"
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
