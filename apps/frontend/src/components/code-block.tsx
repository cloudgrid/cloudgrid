import type { HighlighterCore, TokensResult } from "@shikijs/types";
import { useEffect, useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { cn } from "../lib/utils";
import { useTheme } from "../providers/theme-provider";
import { CopyButton } from "./copy-button";

type CodeLanguage = "bash" | "json" | "log" | "yaml";
type CodeTheme = "github-dark-default" | "github-light-default";

type CodeBlockProps = {
  code: string;
  language?: CodeLanguage;
  title?: string;
  className?: string;
  maxHeightClassName?: string;
};

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  highlighter ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("@shikijs/langs/json"),
    import("@shikijs/langs/log"),
    import("@shikijs/langs/bash"),
    import("@shikijs/langs/yaml"),
    import("@shikijs/themes/github-dark-default"),
    import("@shikijs/themes/github-light-default"),
  ]).then(([core, engine, json, log, bash, yaml, githubDarkDefault, githubLightDefault]) =>
    core.createHighlighterCore({
      themes: [githubDarkDefault.default, githubLightDefault.default],
      langs: [bash.default, json.default, log.default, yaml.default],
      engine: engine.createJavaScriptRegexEngine(),
    }),
  );

  return highlighter;
}

function tokenFontStyle(fontStyle: number | undefined) {
  return {
    fontStyle: fontStyle === 1 ? "italic" : undefined,
    fontWeight: fontStyle === 2 ? "700" : undefined,
    textDecoration: fontStyle === 4 ? "underline" : undefined,
  };
}

export function CodeBlock({
  code,
  language = "log",
  title,
  className,
  maxHeightClassName = "max-h-80",
}: CodeBlockProps) {
  const { appliedTheme } = useTheme();
  const [tokens, setTokens] = useState<TokensResult | null>(null);
  const theme: CodeTheme = appliedTheme === "dark" ? "github-dark-default" : "github-light-default";
  const trimmedCode = useMemo(() => code.trimEnd(), [code]);
  const highlightedLines = useMemo(
    () =>
      tokens?.tokens.map((line, index, lines) => ({
        key:
          line.length > 0
            ? `line-${line[0]?.offset ?? 0}-${line.map((token) => token.content).join("")}`
            : `empty-line-${index}`,
        tokens: line,
        hasTrailingNewline: index < lines.length - 1,
      })) ?? [],
    [tokens],
  );

  useEffect(() => {
    let cancelled = false;

    setTokens(null);
    void getHighlighter().then((instance) => {
      if (!cancelled) {
        setTokens(
          instance.codeToTokens(trimmedCode, {
            lang: language,
            theme,
          }),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [language, theme, trimmedCode]);

  return (
    <figure className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          {title ? <div className="truncate text-xs font-medium">{title}</div> : null}
          <div className="font-mono text-[11px] text-muted-foreground">{language}</div>
        </div>
        <CopyButton aria-label={t("actions.copy")} value={trimmedCode} />
      </figcaption>
      <div className={cn("overflow-auto bg-background text-xs", maxHeightClassName)}>
        {tokens ? (
          <pre
            className="m-0 p-3 font-mono leading-relaxed"
            style={{ backgroundColor: tokens.bg, color: tokens.fg }}
          >
            <code>
              {highlightedLines.map((line) => (
                <span key={line.key}>
                  {line.tokens.map((token) => (
                    <span
                      key={`token-${token.offset}-${token.content}`}
                      style={{
                        color: token.color,
                        ...tokenFontStyle(token.fontStyle),
                      }}
                    >
                      {token.content}
                    </span>
                  ))}
                  {line.hasTrailingNewline ? "\n" : null}
                </span>
              ))}
            </code>
          </pre>
        ) : (
          <pre className="m-0 p-3 font-mono leading-relaxed text-muted-foreground">
            <code>{trimmedCode}</code>
          </pre>
        )}
      </div>
    </figure>
  );
}
