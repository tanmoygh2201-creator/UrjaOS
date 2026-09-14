import ReactMarkdown from "react-markdown";

/**
 * Renders Copilot answers as markdown inside chat bubbles (spec §41).
 *
 * react-markdown never evaluates raw HTML, so grounded-model output can't
 * inject markup — and we map every element to Tailwind tokens so the bubbles
 * match the app's design system instead of a browser-default look.
 */
export function MarkdownAnswer({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="m-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="m-0 my-1.5 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="m-0 my-1.5 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="m-0 pl-0.5">{children}</li>,
          h1: ({ children }) => (
            <h1 className="m-0 mb-1.5 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="m-0 mb-1.5 text-base font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="m-0 mb-1.5 text-sm font-semibold">{children}</h3>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            return (
              <code
                className={
                  isBlock
                    ? "block whitespace-pre-wrap rounded-md bg-background/70 p-2 text-xs"
                    : "rounded bg-background/70 px-1 py-0.5 text-xs"
                }
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="m-0 my-1.5 overflow-x-auto">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="m-0 my-1.5 border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-2 border-border" />,
          table: ({ children }) => (
            <div className="my-1.5 overflow-x-auto">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/60 px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
