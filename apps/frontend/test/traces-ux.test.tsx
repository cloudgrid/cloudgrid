import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TraceSearchResult } from "@cloudgrid/ui-contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { TraceDetailView } from "../src/features/traces/trace-detail-view";
import { buildBalancedTraceFixture } from "../src/features/traces/trace-fixtures";
import { TraceTable } from "../src/features/traces/trace-table";
import { ThemeProvider } from "../src/providers/theme-provider";

const traceResult: TraceSearchResult = {
  items: [
    {
      id: "trace-1",
      serviceName: "checkout-api",
      operationName: "POST /checkout",
      startedAt: "2026-05-15T08:00:00.000Z",
      endedAt: "2026-05-15T08:00:01.200Z",
      durationMs: 1200,
      rootSpanId: "span-root",
      status: "error",
      attributes: { "cloudgrid.rootOperation": "SHOULD NOT RENDER" },
      spanCount: 7,
      errorSpanCount: 1,
      logCount: 3,
      serviceCount: 2,
    },
  ],
  nextCursor: null,
};
const tracesRouteSource = readFileSync(
  join(import.meta.dir, "../src/routes/traces-route.tsx"),
  "utf8",
);
const liveRouteSource = readFileSync(join(import.meta.dir, "../src/routes/live-route.tsx"), "utf8");
const traceFiltersSource = readFileSync(
  join(import.meta.dir, "../src/features/traces/trace-filters.tsx"),
  "utf8",
);
const urlFiltersSource = readFileSync(join(import.meta.dir, "../src/lib/url-filters.ts"), "utf8");

function traceTableMarkup() {
  return renderToStaticMarkup(
    <TooltipProvider>
      <MemoryRouter>
        <TraceTable result={traceResult} sort="startedAt_desc" />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function detailMarkup({ selectedTab = "attributes", view = "waterfall" } = {}) {
  const detail = buildBalancedTraceFixture(12);
  const selected = detail.spans[1];
  if (selected) {
    selected.attributes = {
      "http.method": "POST",
      "db.system": "postgresql",
      "custom.payload": { ok: true },
    };
    selected.links = [
      {
        traceId: detail.trace.id,
        spanId: detail.spans[2]?.id ?? selected.id,
        traceState: "state-a",
        attributes: { "link.reason": "retry" },
        direction: "forward",
      },
      {
        traceId: "trace-cross",
        spanId: "span-cross",
        traceState: null,
        attributes: {},
        direction: "backward",
      },
    ];
  }

  const traceFilters = {
    filters: {
      selectedSpanId: selected?.id ?? null,
      spanQuery: null,
      spanService: null,
      spanName: null,
      spanStatus: null,
      minSpanDurationMs: null,
      maxSpanDurationMs: null,
      attributes: null,
      showMatchesOnly: false,
      relatedLogLimit: 50,
      logSearch: null,
    },
    searchParams: new URLSearchParams(`spanId=${selected?.id ?? ""}&view=${view}`),
    selectedSpanId: selected?.id ?? null,
    selectedTab,
    criticalPathOnly: false,
    errorsOnly: false,
    setFilter() {},
    setBooleanFilter() {},
    setBooleanFilters() {},
    clearFilters() {},
  };

  return renderToStaticMarkup(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter
          initialEntries={[`/traces/${detail.trace.id}?spanId=${selected?.id ?? ""}&view=${view}`]}
        >
          <TraceDetailView detail={detail} traceFilters={traceFilters} />
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

describe("traces UX migration", () => {
  test("trace route keeps the agreed history/live workspace layout", () => {
    expect(tracesRouteSource).toContain("xl:grid-cols-[260px_minmax(0,1fr)]");
    expect(tracesRouteSource.indexOf("<TraceFacetsContent")).toBeLessThan(
      tracesRouteSource.indexOf("<TraceTable"),
    );
    expect(tracesRouteSource).toContain("TraceFacetDrawer");
    expect(tracesRouteSource).toContain("toggleServiceFilter");
    expect(tracesRouteSource).toContain('t("traces.mode.history")');
    expect(tracesRouteSource).toContain('t("traces.mode.live")');
    expect(tracesRouteSource).toContain('onSortChange={(value) => setFilter("sort", value)}');
    expect(traceFiltersSource).not.toContain("Collapsible");
    expect(traceFiltersSource).toContain("activeTraceFilterChips");
    expect(
      readFileSync(join(import.meta.dir, "../src/features/telemetry/facet-panel.tsx"), "utf8"),
    ).toContain("isSelected ? null : facet.value");
    expect(traceFiltersSource.indexOf("TraceMoreFilters")).toBeLessThan(
      traceFiltersSource.indexOf('id="trace-from"'),
    );
    expect(tracesRouteSource).toContain("RouteBreadcrumb");
  });

  test("uses shared trace query defaults instead of route-local constants", () => {
    expect(urlFiltersSource).toContain("@cloudgrid/ui-contracts");
    expect(urlFiltersSource).toContain("TRACE_SEARCH_DEFAULT_LIMIT");
    expect(urlFiltersSource).toContain("TRACE_RELATED_LOG_DEFAULT_LIMIT");
    expect(urlFiltersSource).toContain("traceSortOrDefault");
    expect(tracesRouteSource).toContain("TRACE_SEARCH_DEFAULT_LIMIT");
    expect(tracesRouteSource).toContain("limit: TRACE_SEARCH_DEFAULT_LIMIT");
    expect(urlFiltersSource).not.toContain("const traceSorts");
    expect(urlFiltersSource).not.toContain("function traceSortOrNull");
    expect(tracesRouteSource).toContain('sort={filters.sort ?? "startedAt_desc"}');
  });

  test("span selection is presentation state and does not refetch trace detail", () => {
    const traceDetailRouteSource = readFileSync(
      join(import.meta.dir, "../src/routes/trace-detail-route.tsx"),
      "utf8",
    );

    expect(traceDetailRouteSource).toContain("traceDetailQueryInput(traceFilters.filters)");
    expect(traceDetailRouteSource).not.toContain(
      'queryKeys.trace(traceId ?? "", traceFilters.filters)',
    );
    expect(traceDetailRouteSource).not.toContain(
      'client.getTrace(traceId ?? "", traceFilters.filters)',
    );
  });

  test("waterfall span selection preserves expansion state instead of rebuilding the tree", () => {
    const waterfallSource = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-tree-waterfall.tsx"),
      "utf8",
    );

    expect(waterfallSource).toContain("expandSelectedSpanPath");
    expect(waterfallSource).not.toContain(
      "}, [indexes, selectedSpanId, criticalPathSpanIdSet, errorSpanIds]);",
    );
  });

  test("uses route-specific empty-state copy and working resizable panel constraints", () => {
    expect(tracesRouteSource).toContain('title={t("traces.empty.noTraces.title")}');
    expect(tracesRouteSource).toContain('title={t("traces.empty.filtered.title")}');
    expect(tracesRouteSource).not.toContain("h-[calc(100vh-5.5rem)]");

    const traceDetailSource = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-detail-view.tsx"),
      "utf8",
    );
    expect(
      readFileSync(
        join(import.meta.dir, "../src/features/traces/trace-waterfall-panel.tsx"),
        "utf8",
      ),
    ).toContain("TraceWaterfallPanel");
    expect(
      readFileSync(join(import.meta.dir, "../src/features/traces/trace-flow-graph.tsx"), "utf8"),
    ).toContain("TraceFlowGraph");
    expect(
      readFileSync(join(import.meta.dir, "../src/features/traces/span-inspector.tsx"), "utf8"),
    ).toContain("SpanInspector");
    expect(
      readFileSync(join(import.meta.dir, "../src/features/traces/attribute-browser.tsx"), "utf8"),
    ).toContain("AttributeEvidenceBrowser");
    expect(
      readFileSync(join(import.meta.dir, "../src/features/traces/span-links-table.tsx"), "utf8"),
    ).toContain("SpanLinksTable");
    expect(
      readFileSync(join(import.meta.dir, "../src/features/traces/trace-logs-panel.tsx"), "utf8"),
    ).toContain("TraceLogsPanel");
    expect(traceDetailSource).toContain("TraceWaterfallPanel");
    expect(traceDetailSource).toContain("SpanInspector");
    expect(traceDetailSource).not.toContain("function TraceFlowGraph");
    expect(traceDetailSource).not.toContain("function AttributeEvidenceBrowser");
    expect(traceDetailSource).toContain('defaultSize="68%"');
    expect(traceDetailSource).toContain('defaultSize="420px"');
    expect(traceDetailSource).toContain('maxSize="640px"');
    const traceWaterfallSource = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-waterfall-panel.tsx"),
      "utf8",
    );
    expect(traceWaterfallSource).toContain(
      '"flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden"',
    );
    expect(traceDetailSource).toContain('className="min-h-0 overflow-hidden"');
    expect(
      readFileSync(join(import.meta.dir, "../src/features/traces/trace-flow-graph.tsx"), "utf8"),
    ).toContain("touch-none cursor-grab overflow-auto overscroll-contain");
    expect(traceDetailSource).not.toContain("min-h-[680px]");
  });

  test("live mode is embedded in traces with the same flat filter/chip pattern", () => {
    expect(liveRouteSource).toContain("LiveFilterBar");
    expect(liveRouteSource).toContain("activeLiveFilterChips");
    expect(liveRouteSource).not.toContain('className="text-sm font-medium">{t("live.title")');
    expect(liveRouteSource).not.toContain('aria-label={t("live.copyUrl")}');
  });

  test("trace table exposes operation, copy action, duration bar, and keyboard row affordance", () => {
    const markup = traceTableMarkup();

    expect(markup).toContain(">Operation<");
    expect(markup).toContain("POST /checkout");
    expect(markup).not.toContain("SHOULD NOT RENDER");
    expect(markup).toContain('aria-label="Copy trace ID"');
    expect(markup).toContain('aria-sort="descending"');
    expect(markup).toContain('data-duration-bar="true"');
    expect(markup).toContain('tabindex="0"');
  });

  test("trace table preserves server row ordering and does not keep a local sort fallback", () => {
    const unorderedResult: TraceSearchResult = {
      items: [
        {
          ...traceResult.items[0],
          id: "trace-new",
          operationName: "newer",
          startedAt: "2026-05-15T09:00:00.000Z",
        },
        {
          ...traceResult.items[0],
          id: "trace-old",
          operationName: "older",
          startedAt: "2026-05-15T08:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <MemoryRouter>
          <TraceTable result={unorderedResult} sort="startedAt_asc" />
        </MemoryRouter>
      </TooltipProvider>,
    );
    const source = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-table.tsx"),
      "utf8",
    );

    expect(markup.indexOf("trace-new")).toBeLessThan(markup.indexOf("trace-old"));
    expect(source).not.toContain("localSort");
    expect(source).not.toContain("compareTraceRows");
  });

  test("trace detail uses the approved inspector tabs and removes old overview/log tab surfaces", () => {
    const markup = detailMarkup();

    expect(markup).toContain(">Attributes<");
    expect(markup).toContain(">Events<");
    expect(markup).toContain(">Exceptions<");
    expect(markup).toContain(">Links<");
    expect(markup).not.toContain(">Overview<");
    expect(markup).not.toContain('value="overview"');
    expect(markup).not.toContain('value="logs"');
    expect(markup).not.toContain("trace-service-breakdown");
  });

  test("trace detail renders flow controls, evidence browser groups, and link actions", () => {
    const markup = detailMarkup({ view: "flow" });
    const linksMarkup = detailMarkup({ selectedTab: "links" });

    expect(markup).toContain(">Trace view<");
    expect(markup).toContain(">Waterfall<");
    expect(markup).toContain(">Flow<");
    expect(markup).toContain("data-trace-flow");
    expect(markup).toContain('marker-end="url(#trace-flow-arrow)"');
    expect(markup).toContain("<foreignObject");
    expect(markup).toContain('width="248"');
    expect(markup).toContain("break-words");
    expect(markup).toContain("data-flow-span-id");
    expect(markup).toContain('aria-pressed="true"');
    const source = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-detail-view.tsx"),
      "utf8",
    );
    const flowSource = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-flow-graph.tsx"),
      "utf8",
    );
    const logsSource = readFileSync(
      join(import.meta.dir, "../src/features/traces/trace-logs-panel.tsx"),
      "utf8",
    );
    expect(source).toContain('setLogsMode("selected")');
    expect(source).toContain("setLocalSelectedSpanId(spanId)");
    expect(source).toContain('traceFilters.setFilter("view", mode === "flow" ? "flow" : null)');
    expect(flowSource).toContain("isFlowNodeInteraction(event.target)");
    expect(flowSource).toContain("event.stopPropagation()");
    expect(source).toContain("warning.message");
    expect(flowSource).toContain("requestFullscreen");
    expect(source).not.toContain("<DialogTitle>Flow graph</DialogTitle>");
    expect(logsSource).toContain("<LogDetailDialog");
    expect(logsSource).toContain("<TableHeader>");
    expect(logsSource).toContain("<SortableTableHead");
    expect(markup).toContain("<table");
    expect(markup).toContain("HTTP");
    expect(markup).toContain("Database");
    expect(markup).toContain("Raw attributes");
    expect(markup).toContain('aria-label="Copy attribute"');
    expect(linksMarkup).toContain(">Select span<");
    expect(linksMarkup).toContain(">Open trace<");
    expect(linksMarkup).toContain('aria-label="Copy link reference"');
  });
});
