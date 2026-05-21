import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { CodeBlock } from "../code-block";
import { Button } from "../ui/button";

export function Message({
  className,
  from,
  ...props
}: ComponentProps<"article"> & { from: "assistant" | "system" | "tool" | "user" }) {
  return (
    <article
      className={cn(
        "group flex w-full gap-3",
        from === "user" ? "justify-end" : "justify-start",
        className,
      )}
      data-role={from}
      {...props}
    />
  );
}

export function MessageContent({
  className,
  from,
  ...props
}: ComponentProps<"div"> & { from: "assistant" | "system" | "tool" | "user" }) {
  return (
    <div
      className={cn(
        "flex max-w-[min(1040px,100%)] flex-col gap-2 text-sm leading-6",
        from === "user"
          ? "rounded-md border bg-muted px-3 py-2 text-foreground"
          : "px-1 py-0.5 text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MessageResponse({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("break-words text-pretty", className)} {...props}>
      {children}
    </div>
  );
}

export function MarkdownResponse({
  className,
  text,
  ...props
}: ComponentProps<"div"> & { text: string }) {
  return (
    <MessageResponse className={cn("space-y-3", className)} {...props}>
      <ReactMarkdown
        components={{
          a: ({ children, href }) => {
            const safeHref = safeMarkdownHref(href);
            return safeHref ? (
              <a
                className="underline underline-offset-2"
                href={safeHref}
                rel="noreferrer"
                target="_blank"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
          code: ({ children, className }) => {
            const language = className?.replace("language-", "");
            return (
              <code
                className={cn("rounded bg-muted px-1 py-0.5 font-mono text-xs", className)}
                data-language={language}
              >
                {children}
              </code>
            );
          },
          em: ({ children }) => <em>{children}</em>,
          li: ({ children }) => <li>{children}</li>,
          ol: ({ children }) => <ol className="space-y-1 pl-5 list-decimal">{children}</ol>,
          p: ({ children }) => <p>{children}</p>,
          pre: ({ children }) => {
            const code = extractCodeText(children);
            return (
              <CodeBlock
                code={code.text}
                language={markdownCodeLanguage(code.language)}
                maxHeightClassName="max-h-72"
              />
            );
          },
          strong: ({ children }) => <strong>{children}</strong>,
          table: ({ children }) => (
            <div className="overflow-auto rounded-md border">
              <table className="w-full caption-bottom text-sm">{children}</table>
            </div>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          td: ({ children }) => <td className="border-t px-3 py-2 align-top">{children}</td>,
          th: ({ children }) => (
            <th className="border-b bg-muted/40 px-3 py-2 text-left font-medium">{children}</th>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tr: ({ children }) => <tr>{children}</tr>,
          ul: ({ children }) => <ul className="space-y-1 pl-5 list-disc">{children}</ul>,
        }}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </MessageResponse>
  );
}

export function MessageAvatar({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MessageActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function MessageAction({
  className,
  label,
  title,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      aria-label={label}
      className={cn("size-7 text-muted-foreground", className)}
      size="icon"
      title={title ?? label}
      type="button"
      variant="ghost"
      {...props}
    />
  );
}

function safeMarkdownHref(href: string | undefined) {
  const trimmed = href?.trim() ?? "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" && url.hostname === "cloudgrid.dev") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function markdownCodeLanguage(language: string | undefined) {
  if (language === "bash" || language === "json" || language === "yaml") {
    return language;
  }
  return "log";
}

function extractCodeText(children: unknown) {
  const child = Array.isArray(children) ? children[0] : children;
  if (typeof child === "object" && child !== null && "props" in child) {
    const props = (
      child as { props?: { children?: unknown; "data-language"?: string; className?: string } }
    ).props;
    return {
      language: props?.["data-language"] ?? props?.className?.replace("language-", ""),
      text: String(props?.children ?? ""),
    };
  }
  return { language: undefined, text: String(children ?? "") };
}
