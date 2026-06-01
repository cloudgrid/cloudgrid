import type { Dataset, TelemetryFacetResult, TraceSearchInput } from "@cloudgrid/ui-contracts";
import { buildDatasetSearchInput, TRACE_SEARCH_DEFAULT_LIMIT } from "@cloudgrid/ui-contracts";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCopy, Clock, FileJson, Radio, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { InfiniteScrollSentinel } from "../components/infinite-scroll-sentinel";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
import { RouteBreadcrumb } from "../components/route-breadcrumb";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import { compatibleTraceIntakeDatasets } from "../features/ai-eval/view-model-v2";
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
  const projectId = viewer?.selectedProject?.id ?? "";
  const [selectedTraceIds, setSelectedTraceIds] = useState<Set<string>>(() => new Set());
  const ingestSettingsHref = viewer?.selectedProject
    ? `/projects/${encodeURIComponent(viewer.selectedProject.id)}/settings/ingest`
    : "/projects";
  const { filters, searchParams, setFilter, setServicesFilter, clearFilters } = useTraceFilters();
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const traceMode = routeSearchParams.get("mode") === "live" ? "live" : "history";
  const filtered = hasActiveFilters(searchParams);
  const traceSearchInput = { ...filters, cursor: null, limit: TRACE_SEARCH_DEFAULT_LIMIT };
  const facetInput = {
    from: filters.from ?? null,
    to: filters.to ?? null,
    signal: "traces" as const,
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
  const datasetsQuery = useQuery({
    queryKey: ["Datasets", "trace-import", projectId],
    queryFn: () =>
      client.searchDatasets({
        ...buildDatasetSearchInput({ limit: 50 }),
        projectId,
      }),
    enabled: Boolean(projectId) && traceMode === "history",
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
  const visibleTraceIds = useMemo(
    () => traceResult?.items.map((trace) => trace.id) ?? [],
    [traceResult],
  );

  if (traceMode === "live") {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <TraceModeHeader
          datasets={[]}
          mode={traceMode}
          onModeChange={setTraceMode}
          projectName={viewer?.selectedProject?.name ?? t("projects.select")}
          projectId={projectId}
          selectedTraceIds={new Set()}
          visibleTraceIds={[]}
        />
        <LiveRoute embedded />
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <TraceModeHeader
        datasets={datasetsQuery.data?.items ?? []}
        mode={traceMode}
        onModeChange={setTraceMode}
        projectName={viewer?.selectedProject?.name ?? t("projects.select")}
        projectId={projectId}
        selectedTraceIds={selectedTraceIds}
        visibleTraceIds={visibleTraceIds}
      />
      <TraceFilters
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
        onServicesChange={setServicesFilter}
        serviceOptions={facetsQuery.data?.services}
      />
      <TraceFacetDrawer
        facets={facetsQuery.data}
        isError={facetsQuery.isError}
        isLoading={facetsQuery.isLoading}
        onAttributeKeySelect={(value) => setFilter("attributeKey", value)}
        onOperationSelect={(value) => setFilter("operationName", value)}
        onRetry={() => void facetsQuery.refetch()}
        onServiceSelect={(value) =>
          toggleServiceFilter(filters.services ?? [], value, setServicesFilter)
        }
        onSpanNameSelect={(value) => setFilter("spanName", value)}
        selected={{
          attributeKey: searchParams.get("attributeKey"),
          operation: filters.operationName,
          service: filters.services ?? filters.service,
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
            onServiceSelect={(value) =>
              toggleServiceFilter(filters.services ?? [], value, setServicesFilter)
            }
            onSpanNameSelect={(value) => setFilter("spanName", value)}
            selected={{
              attributeKey: searchParams.get("attributeKey"),
              operation: filters.operationName,
              service: filters.services ?? filters.service,
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
                onSelectedTraceIdsChange={setSelectedTraceIds}
                result={traceResult}
                selectedTraceIds={selectedTraceIds}
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

function toggleServiceFilter(
  current: readonly string[],
  value: string | null,
  onChange: (services: string[]) => void,
) {
  if (!value) {
    onChange([]);
    return;
  }
  onChange(
    current.includes(value) ? current.filter((service) => service !== value) : [...current, value],
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
    service: TraceSearchInput["service"] | TraceSearchInput["services"];
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
  datasets,
  mode,
  onModeChange,
  projectName,
  projectId,
  selectedTraceIds,
  visibleTraceIds,
}: {
  datasets: Dataset[];
  mode: "history" | "live";
  onModeChange: (mode: "history" | "live") => void;
  projectName: string;
  projectId: string;
  selectedTraceIds: ReadonlySet<string>;
  visibleTraceIds: string[];
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
      <div className="flex flex-wrap items-center gap-2">
        {mode === "history" ? (
          <TraceToDatasetCandidateDialog
            datasets={datasets}
            projectId={projectId}
            selectedTraceIds={selectedTraceIds}
            visibleTraceIds={visibleTraceIds}
          />
        ) : null}
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
    </div>
  );
}

function TraceToDatasetCandidateDialog({
  datasets,
  projectId,
  selectedTraceIds,
  visibleTraceIds,
}: {
  datasets: Dataset[];
  projectId: string;
  selectedTraceIds: ReadonlySet<string>;
  visibleTraceIds: string[];
}) {
  const compatible = compatibleTraceIntakeDatasets(datasets);
  const selectedVisibleTraceIds = visibleTraceIds.filter((traceId) =>
    selectedTraceIds.has(traceId),
  );
  const traceRefs = selectedVisibleTraceIds.map((traceId) => ({ traceId }));
  const selectedCount = traceRefs.length;
  const disabled = selectedCount === 0 || !projectId || compatible.length === 0;
  const telemetryClient = useTelemetryClient();
  const mutation = useMutation({
    mutationFn: () =>
      telemetryClient.prepareDatasetCandidates({
        projectId,
        autoMatchDatasets: true,
        traceSelection: {
          mode: "selected",
          traceRefs,
          spanRefs: [],
        },
        previewLimit: 100,
        curationStatus: "needs_expected",
        contentTreatment: "realistic_anonymized",
        idempotencyKey: `trace-candidates-${Date.now()}`,
      }),
  });
  const preparedCount = mutation.data?.items.length ?? 0;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={selectedCount === 0 || !projectId}
          size="sm"
          type="button"
          variant="outline"
        >
          <FileJson data-icon="inline-start" />
          {t("traces.prepareDatasetRows.action")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("traces.prepareDatasetRows.title")}</DialogTitle>
          <DialogDescription>
            {t(
              selectedCount === 1
                ? "traces.prepareDatasetRows.listDescription.one"
                : "traces.prepareDatasetRows.listDescription.other",
              { count: String(selectedCount) },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{t("traces.prepareDatasetRows.selectedCandidates")}</div>
            <div className="mt-1 text-muted-foreground">
              {t(
                selectedCount === 1
                  ? "traces.prepareDatasetRows.selectedCount.one"
                  : "traces.prepareDatasetRows.selectedCount.other",
                { count: String(selectedCount) },
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="text-sm font-medium">
              {t("traces.prepareDatasetRows.matchingDatasets")}
            </div>
            {compatible.map((dataset) => (
              <div className="border px-3 py-2 text-sm" key={dataset.id}>
                {dataset.name}
              </div>
            ))}
            {compatible.length === 0 ? (
              <div className="border border-dashed p-3 text-sm text-muted-foreground">
                {t("traces.prepareDatasetRows.noCompatibleDatasets")}
              </div>
            ) : null}
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t("traces.prepareDatasetRows.previewNote")}
          </div>
          {mutation.data ? (
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">
                {t(
                  preparedCount === 1
                    ? "traces.prepareDatasetRows.prepared.one"
                    : "traces.prepareDatasetRows.prepared.other",
                  { count: String(preparedCount) },
                )}
              </div>
              <div className="mt-1 text-muted-foreground">
                {t("traces.prepareDatasetRows.reviewPrepared")}
              </div>
            </div>
          ) : null}
          {mutation.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {mutation.error.message}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button asChild type="button" variant="outline">
            <Link to="/ai-eval?tab=datasets">{t("traces.prepareDatasetRows.openDatasets")}</Link>
          </Button>
          <Button
            disabled={disabled || mutation.isPending}
            onClick={() => void mutation.mutateAsync()}
            type="button"
          >
            <FileJson data-icon="inline-start" />
            {t("actions.previewRows")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
