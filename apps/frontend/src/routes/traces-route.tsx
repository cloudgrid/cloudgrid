import type { TelemetryFacetResult, TraceSearchInput } from "@cloudgrid/ui-contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ClipboardCopy, Clock, Radio, SlidersHorizontal, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { InfiniteScrollSentinel } from "../components/infinite-scroll-sentinel";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
import { RouteBreadcrumb } from "../components/route-breadcrumb";
import { Button } from "../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import { FacetPanel } from "../features/telemetry/facet-panel";
import { TraceFilters } from "../features/traces/trace-filters";
import { TraceTable } from "../features/traces/trace-table";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { hasActiveFilters, useTraceFilters } from "../lib/url-filters";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";
import { LiveRoute } from "./live-route";

export function TracesRoute() {
  const client = useTelemetryClient();
  const { viewer } = useAppSession();
  const ingestSettingsHref = viewer?.selectedProject
    ? `/projects/${encodeURIComponent(viewer.selectedProject.id)}/settings/ingest`
    : "/projects";
  const { filters, searchParams, setFilter, clearFilters } = useTraceFilters();
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const traceMode = routeSearchParams.get("mode") === "live" ? "live" : "history";
  const filtered = hasActiveFilters(searchParams);
  const traceSearchInput = { ...filters, cursor: null };
  const facetInput = {
    from: filters.from ?? null,
    to: filters.to ?? null,
    service: filters.service ?? null,
    search: filters.query ?? null,
    limit: 25,
  };
  const debouncedFacetInput = useDebouncedValue(facetInput, 250);
  const query = useInfiniteQuery({
    queryKey: queryKeys.traces(traceSearchInput),
    queryFn: ({ pageParam }) => client.searchTraces({ ...traceSearchInput, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: traceMode === "history",
  });
  const facetsQuery = useQuery({
    queryKey: queryKeys.telemetryFacets(debouncedFacetInput),
    queryFn: () => client.getTelemetryFacets(debouncedFacetInput),
    enabled: traceMode === "history",
  });

  const setTraceMode = (mode: "history" | "live") => {
    setRouteSearchParams((params) => {
      if (mode === "live") {
        params.set("mode", "live");
      } else {
        params.delete("mode");
      }
      return params;
    });
  };
  const traceResult = query.data
    ? {
        items: query.data.pages.flatMap((page) => page.items),
        nextCursor: query.hasNextPage ? (query.data.pages.at(-1)?.nextCursor ?? null) : null,
      }
    : null;

  if (traceMode === "live") {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <TraceModeHeader
          mode={traceMode}
          onModeChange={setTraceMode}
          projectName={viewer?.selectedProject?.name ?? t("projects.select")}
        />
        <LiveRoute embedded />
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <TraceModeHeader
        mode={traceMode}
        onModeChange={setTraceMode}
        projectName={viewer?.selectedProject?.name ?? t("projects.select")}
      />
      <TraceFilters filters={filters} onChange={setFilter} onClear={clearFilters} />
      <TraceFacetDrawer
        facets={facetsQuery.data}
        isError={facetsQuery.isError}
        isLoading={facetsQuery.isLoading}
        onAttributeKeySelect={(value) => setFilter("attributeKey", value)}
        onOperationSelect={(value) => setFilter("operationName", value)}
        onRetry={() => void facetsQuery.refetch()}
        onServiceSelect={(value) => setFilter("service", value)}
        onSpanNameSelect={(value) => setFilter("spanName", value)}
        selected={{
          attributeKey: searchParams.get("attributeKey"),
          operation: filters.operationName,
          service: filters.service,
          spanName: filters.spanName,
        }}
        error={facetsQuery.error}
      />
      <div className="grid min-h-0 flex-1 overflow-hidden border bg-background xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 overflow-auto border-r p-3 xl:block">
          <TraceFacetsContent
            error={facetsQuery.error}
            facets={facetsQuery.data}
            isError={facetsQuery.isError}
            isLoading={facetsQuery.isLoading}
            onAttributeKeySelect={(value) => setFilter("attributeKey", value)}
            onOperationSelect={(value) => setFilter("operationName", value)}
            onRetry={() => void facetsQuery.refetch()}
            onServiceSelect={(value) => setFilter("service", value)}
            onSpanNameSelect={(value) => setFilter("spanName", value)}
            selected={{
              attributeKey: searchParams.get("attributeKey"),
              operation: filters.operationName,
              service: filters.service,
              spanName: filters.spanName,
            }}
          />
        </aside>
        <section className="flex min-h-0 flex-col overflow-hidden bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
            {query.isLoading ? <LoadingRows /> : null}
            {query.isError ? (
              <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
            ) : null}
            {query.isSuccess && traceResult?.items.length === 0 && filtered ? (
              <EmptyState
                filtered={filtered}
                title={t("traces.empty.filtered.title")}
                description={t("traces.empty.filtered.description")}
                primaryAction={
                  <Button onClick={clearFilters}>
                    <X data-icon="inline-start" />
                    {t("filters.clear")}
                  </Button>
                }
              />
            ) : null}
            {query.isSuccess && traceResult?.items.length === 0 && !filtered ? (
              <EmptyState
                filtered={filtered}
                title={t("traces.empty.noTraces.title")}
                description={t("traces.empty.noTraces.description")}
                primaryAction={
                  <Button asChild>
                    <Link to={ingestSettingsHref}>
                      <ClipboardCopy data-icon="inline-start" />
                      {t("projects.checklist.copy.action")}
                    </Link>
                  </Button>
                }
              />
            ) : null}
            {query.isSuccess && traceResult && traceResult.items.length > 0 ? (
              <TraceTable
                onSortChange={(value) => setFilter("sort", value)}
                result={traceResult}
                sort={filters.sort ?? "startedAt_desc"}
              />
            ) : null}
            <InfiniteScrollSentinel
              hasMore={query.hasNextPage}
              isLoading={query.isFetchingNextPage}
              label={t("actions.loadMore")}
              loadingLabel={t("actions.loadingMore")}
              onLoadMore={() => void query.fetchNextPage()}
            />
          </div>
        </section>
      </div>
    </section>
  );
}

function TraceFacetDrawer(props: TraceFacetsContentProps) {
  return (
    <div className="flex shrink-0 justify-end xl:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="outline">
            <SlidersHorizontal data-icon="inline-start" />
            {t("filters.facets")}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[340px] max-w-[88vw]" side="left">
          <SheetHeader>
            <SheetTitle>{t("filters.facets")}</SheetTitle>
            <SheetDescription>{t("filters.traceSearchHint")}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-auto px-4">
            <TraceFacetsContent {...props} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface TraceFacetsContentProps {
  error: unknown;
  facets: TelemetryFacetResult | undefined;
  isError: boolean;
  isLoading: boolean;
  onAttributeKeySelect: (value: string | null) => void;
  onOperationSelect: (value: string | null) => void;
  onRetry: () => void;
  onServiceSelect: (value: string | null) => void;
  onSpanNameSelect: (value: string | null) => void;
  selected: {
    attributeKey: string | null;
    operation: TraceSearchInput["operationName"];
    service: TraceSearchInput["service"];
    spanName: TraceSearchInput["spanName"];
  };
}

function TraceFacetsContent({
  error,
  facets,
  isError,
  isLoading,
  onAttributeKeySelect,
  onOperationSelect,
  onRetry,
  onServiceSelect,
  onSpanNameSelect,
  selected,
}: TraceFacetsContentProps) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">{t("filters.facets")}</h2>
      {isLoading ? <LoadingRows /> : null}
      {isError ? (
        <ErrorPanel error={error} onRetry={onRetry} title={t("state.error.facetsTitle")} />
      ) : null}
      {facets ? (
        <FacetPanel
          facets={facets}
          onAttributeKeySelect={onAttributeKeySelect}
          onOperationSelect={onOperationSelect}
          onServiceSelect={onServiceSelect}
          onSpanNameSelect={onSpanNameSelect}
          selected={selected}
        />
      ) : null}
    </div>
  );
}

function TraceModeHeader({
  mode,
  onModeChange,
  projectName,
}: {
  mode: "history" | "live";
  onModeChange: (mode: "history" | "live") => void;
  projectName: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b pb-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-2">
        <RouteBreadcrumb
          backLabel={t("actions.back")}
          backTo="/projects"
          items={[
            { label: t("nav.projects"), to: "/projects" },
            { label: projectName, to: "/projects" },
            { label: t("traces.title") },
          ]}
        />
        <h1 className="text-xl font-semibold tracking-normal">{t("traces.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("traces.description")}</p>
      </div>
      <div className="flex items-center gap-1 rounded-md border p-1">
        <Button
          onClick={() => onModeChange("history")}
          size="sm"
          type="button"
          variant={mode === "history" ? "secondary" : "ghost"}
        >
          <Clock data-icon="inline-start" />
          {t("traces.mode.history")}
        </Button>
        <Button
          onClick={() => onModeChange("live")}
          size="sm"
          type="button"
          variant={mode === "live" ? "secondary" : "ghost"}
        >
          <Radio data-icon="inline-start" />
          {t("traces.mode.live")}
        </Button>
      </div>
    </div>
  );
}
