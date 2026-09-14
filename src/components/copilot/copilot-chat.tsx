"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Bot, Loader2, Send, User } from "lucide-react";
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
          <div className="flex flex-1 items-center justify-center py-8 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask anything about this system — the Copilot answers only from
              your real readings, forecasts, and plans. No data, no answer.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex items-start gap-2.5 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                  message.role === "user"
                    ? "bg-secondary text-secondary-foreground"
                    : message.isError
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                }`}
              >
                {message.role === "user" ? (
                  <User className="size-4" aria-hidden="true" />
                ) : message.isError ? (
                  <AlertTriangle className="size-4" aria-hidden="true" />
                ) : (
                  <Bot className="size-4" aria-hidden="true" />
                )}
              </span>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm ${
                  message.role === "user"
                    ? "bg-secondary text-secondary-foreground"
                    : message.isError
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted/60 text-foreground"
                }`}
              >
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Reading your system data…
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
