import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent, LogSearchResult } from "@cloudgrid/ui-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { LogInspector, LogTable } from "../src/features/logs/log-table";
import { ThemeProvider } from "../src/providers/theme-provider";
import { hasActiveFiltersForLogs, logInspectorTabOrDefault } from "../src/routes/logs-route";

const logsRouteSource = readFileSync(join(import.meta.dir, "../src/routes/logs-route.tsx"), "utf8");
const logFiltersSource = readFileSync(
  join(import.meta.dir, "../src/features/logs/log-filters.tsx"),
  "utf8",
);
const urlFiltersSource = readFileSync(join(import.meta.dir, "../src/lib/url-filters.ts"), "utf8");

const log: LogEvent = {
  id: "log-1",
  traceId: "trace-1",
  spanId: "span-1",
  serviceName: "checkout-api",
  severityText: "ERROR",
  severityNumber: 17,
  body: { message: "checkout failed", nested: { ok: false } },
  timestamp: "2026-05-15T08:00:00.000Z",
  observedTimestamp: "2026-05-15T08:00:01.000Z",
  attributes: {
    "service.name": "checkout-api",
    "http.method": "POST",
    "custom.user": "user-1",
  },
  correlation: "span",
};

const result: LogSearchResult = {
  items: [log],
  nextCursor: null,
};

function renderWithProviders(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return renderToStaticMarkup(
    <ThemeProvider>
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

describe("logs UX migration", () => {
  test("keeps logs as table plus right inspector without a permanent facet rail", () => {
    expect(logsRouteSource).toContain('orientation="horizontal"');
    expect(logsRouteSource).toContain("LogInspector");
    expect(logsRouteSource).not.toContain("<FacetPanel");
    expect(logsRouteSource).not.toContain('aria-label={t("actions.copyUrl")}');
    expect(logsRouteSource).toContain("RouteBreadcrumb");
    expect(logsRouteSource).toContain('defaultSize="420px"');
    expect(logsRouteSource).toContain('maxSize="640px"');
    expect(logsRouteSource).toContain('onSortChange={(value) => setFilter("sort", value)}');
    expect(logsRouteSource).not.toContain("h-[calc(100vh-5.5rem)]");
    expect(logFiltersSource).not.toContain("Collapsible");
    expect(logFiltersSource).toContain("LogMoreFilters");
    expect(logFiltersSource.indexOf("LogMoreFilters")).toBeLessThan(
      logFiltersSource.indexOf('id="log-trace"'),
    );
  });

  test("uses route-specific empty states for logs", () => {
    expect(logsRouteSource).toContain('title={t("logs.empty.noLogs.title")}');
    expect(logsRouteSource).toContain('title={t("logs.empty.filtered.title")}');
  });

  test("keeps selected log ID and inspector tab separate from filter state", () => {
    expect(logInspectorTabOrDefault("correlation")).toBe("correlation");
    expect(logInspectorTabOrDefault("attributes")).toBe("attributes");
    expect(logInspectorTabOrDefault("legacy")).toBe("body");
    expect(hasActiveFiltersForLogs(new URLSearchParams("logId=log-1&tab=body"))).toBe(false);
    expect(hasActiveFiltersForLogs(new URLSearchParams("logId=log-1&service=checkout"))).toBe(true);
  });

  test("log table keeps inline expansion narrow-only and exposes trace pivots", () => {
    const markup = renderWithProviders(
      <LogTable result={result} selectedLogId="log-1" sort="timestamp_desc" />,
    );

    expect(markup).toContain("lg:hidden");
    expect(markup).toContain(">Attributes<");
    expect(markup).toContain(">Actions<");
    expect(markup).toContain('aria-sort="descending"');
    expect(markup).toContain("/traces/trace-1");
    expect(markup).toContain("/traces/trace-1?spanId=span-1");
  });

  test("log table preserves server row ordering and does not keep a local sort fallback", () => {
    const unorderedResult: LogSearchResult = {
      items: [
        {
          ...log,
          id: "log-new",
          body: "new log body",
          timestamp: "2026-05-15T09:00:00.000Z",
        },
        {
          ...log,
          id: "log-old",
          body: "old log body",
          timestamp: "2026-05-15T08:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    const markup = renderWithProviders(<LogTable result={unorderedResult} sort="timestamp_asc" />);
    const source = readFileSync(
      join(import.meta.dir, "../src/features/logs/log-table.tsx"),
      "utf8",
    );

    expect(markup.indexOf("new log body")).toBeLessThan(markup.indexOf("old log body"));
    expect(source).not.toContain("localSort");
    expect(source).not.toContain("compareLogRows");
  });

  test("log inspector uses approved tabs and copy actions", () => {
    const markup = renderWithProviders(
      <LogInspector log={log} onTabChange={() => {}} tab="attributes" />,
    );

    expect(markup).toContain(">Body<");
    expect(markup).toContain(">Attributes<");
    expect(markup).toContain(">Correlation<");
    expect(markup).toContain('aria-label="Copy log ID"');
    expect(markup).toContain('aria-label="Copy attribute key service.name"');
    expect(markup).toContain('aria-label="Copy attribute value service.name"');
    expect(markup).toContain("Raw attributes");
  });

  test("uses shared log query defaults instead of route-local constants", () => {
    expect(urlFiltersSource).toContain("@cloudgrid/ui-contracts");
    expect(urlFiltersSource).toContain("LOG_SEARCH_DEFAULT_LIMIT");
    expect(urlFiltersSource).toContain("logSortOrDefault");
    expect(urlFiltersSource).not.toContain("const logSorts");
    expect(urlFiltersSource).not.toContain("function logSortOrNull");
    expect(logsRouteSource).toContain('sort={filters.sort ?? "timestamp_desc"}');
  });
});
