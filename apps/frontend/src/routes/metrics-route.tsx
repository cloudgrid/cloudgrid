import type {
  AttributeFilterInput,
  MetricAggregation,
  MetricChartType,
  MetricDescriptor,
  MetricSeriesInput,
} from "@cloudgrid/ui-contracts";
import {
  buildMetricSeriesInput,
  createDefaultMetricTimeRange,
  createObservedMetricRange,
  defaultMetricAggregation,
  metricAggregationOrDefault,
  metricChartTypeOrDefault,
} from "@cloudgrid/ui-contracts";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingRows } from "../components/query-state";
import { InfiniteScrollSentinel } from "../components/infinite-scroll-sentinel";
import { Button } from "../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  CenteredMessage,
  MetricExplorerEmpty,
  MetricInspector,
  type MetricInspectorTab,
  MetricList,
  MetricQueryControls,
  MetricSearchField,
  MetricSeriesExplorer,
  metricAggregations,
  metricChartTypes,
  metricInspectorTabOrDefault,
  sanitizeMetricGroupBy,
} from "../features/metrics/metric-explorer";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

interface TimeRange {
  from: string;
  to: string;
}

export interface MetricQueryState extends TimeRange {
  metricName: string | null;
  aggregation: MetricAggregation;
  interval: string;
  groupBy: string[];
  filters: AttributeFilterInput[];
  chartType: MetricChartType;
}

export function selectedMetricFromSearchParams(searchParams: URLSearchParams): string | null {
  return stringOrNull(searchParams.get("metric") ?? searchParams.get("metricName"));
}

export function defaultMetricQueryState(searchParams: URLSearchParams): MetricQueryState {
  const range = createDefaultMetricTimeRange();
  return {
    metricName: selectedMetricFromSearchParams(searchParams),
    from: searchParams.get("from") ?? range.from,
    to: searchParams.get("to") ?? range.to,
    aggregation: metricAggregationOrDefault(searchParams.get("aggregation")),
    interval: searchParams.get("interval") ?? "PT1M",
    groupBy: splitCsv(searchParams.get("groupBy") ?? searchParams.get("group") ?? ""),
    filters: attributeFilters(searchParams),
    chartType: metricChartTypeOrDefault(searchParams.get("chartType")),
  };
}

export { sanitizeMetricGroupBy };
export { buildMetricSeriesInput } from "@cloudgrid/ui-contracts";

export function metricRouteCachePredicate(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "MetricNames" || queryKey[0] === "MetricSeries";
}

export function MetricsRoute() {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const { viewer } = useAppSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [metricSearch, setMetricSearch] = useState(searchParams.get("query") ?? "");
  const selectedProjectId = viewer?.selectedProject?.id ?? "";
  const previousProjectIdRef = useRef(selectedProjectId);
  const debouncedMetricSearch = useDebouncedValue(metricSearch, 250);
  const state = defaultMetricQueryState(searchParams);
  const inspectorTab = metricInspectorTabOrDefault(searchParams.get("tab"));
  const ingestSettingsHref = viewer?.selectedProject
    ? `/projects/${encodeURIComponent(viewer.selectedProject.id)}/settings/ingest`
    : "/projects";

  useEffect(() => {
    if (previousProjectIdRef.current === selectedProjectId) {
      return;
    }
    previousProjectIdRef.current = selectedProjectId;
    void queryClient.resetQueries({
      predicate: (query) => metricRouteCachePredicate(query.queryKey),
    });
  }, [queryClient, selectedProjectId]);

  const namesInput = {
    query: debouncedMetricSearch || null,
    service: searchParams.get("service") || null,
    from: searchParams.get("from") || null,
    to: searchParams.get("to") || null,
    limit: 100,
  };
  const namesQuery = useInfiniteQuery({
    queryKey: queryKeys.metricNames(namesInput),
    queryFn: ({ pageParam }) =>
      telemetryClient.getMetricNames({ ...namesInput, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const metricNames = useMemo(
    () => namesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [namesQuery.data],
  );
  const selectedMetric = useMemo(
    () => metricNames.find((metric) => metric.name === state.metricName) ?? null,
    [metricNames, state.metricName],
  );
  const effectiveState = selectedMetric
    ? withMetricDescriptorDefaults(state, selectedMetric, {
        hasAggregation: searchParams.has("aggregation"),
        hasFrom: searchParams.has("from"),
        hasTo: searchParams.has("to"),
      })
    : state;
  const sanitizedGroupBy = sanitizeMetricGroupBy(effectiveState.groupBy, selectedMetric);
  const seriesInput = selectedMetric
    ? buildMetricSeriesInput(selectedMetric, { ...effectiveState, groupBy: sanitizedGroupBy })
    : null;
  const seriesQuery = useQuery({
    enabled: Boolean(seriesInput),
    queryKey: seriesInput ? queryKeys.metricSeries(seriesInput) : ["MetricSeries", "idle"],
    queryFn: () => telemetryClient.getMetricSeries(seriesInput as MetricSeriesInput),
  });

  useEffect(() => {
    if (state.metricName || !metricNames[0]) {
      return;
    }
    setSearchParams((params) => {
      params.set("metric", metricNames[0]?.name ?? "");
      return params;
    });
  }, [metricNames, setSearchParams, state.metricName]);

  const setParam = (key: string, value: string | null) => {
    setSearchParams((params) => {
      if (value?.trim()) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (key !== "cursor") {
        params.delete("cursor");
      }
      return params;
    });
  };
  const setGroupBy = (groupBy: string[]) => {
    setSearchParams((params) => {
      if (groupBy.length > 0) {
        params.set("groupBy", groupBy.join(","));
      } else {
        params.delete("groupBy");
      }
      return params;
    });
  };
  const setInspectorTab = (tab: MetricInspectorTab) => {
    setSearchParams((params) => {
      params.set("tab", tab);
      return params;
    });
  };
  const selectMetric = (metricName: string) => {
    setSearchParams((params) => {
      params.set("metric", metricName);
      return params;
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">{t("metrics.title")}</h1>
          {state.metricName ? (
            <p className="truncate text-sm text-muted-foreground">{state.metricName}</p>
          ) : null}
        </div>
        <div className="flex items-end gap-2">
          <MetricTimeRangePopover
            from={effectiveState.from}
            onChange={setParam}
            to={effectiveState.to}
          />
          <Button
            aria-label={t("metrics.refresh")}
            onClick={() => {
              void namesQuery.refetch();
              void seriesQuery.refetch();
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw />
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b pb-2">
        <FieldGroup className="grid gap-2 lg:grid-cols-[1.4fr_1fr]">
          <MetricSearchField
            metricSearch={metricSearch}
            onChange={(value) => {
              setMetricSearch(value);
              setParam("query", value);
            }}
          />
          <Field>
            <FieldLabel htmlFor="metric-service">{t("filters.service")}</FieldLabel>
            <Input
              id="metric-service"
              onChange={(event) => setParam("service", event.target.value)}
              placeholder={t("metrics.service.placeholder")}
              value={searchParams.get("service") ?? ""}
            />
          </Field>
        </FieldGroup>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden border-r pr-3">
          <div className="min-h-0 flex-1 overflow-auto">
            {namesQuery.isLoading ? <LoadingRows /> : null}
            {namesQuery.isError ? (
              <ErrorPanel error={namesQuery.error} onRetry={() => void namesQuery.refetch()} />
            ) : null}
            {namesQuery.isSuccess && metricNames.length === 0 ? (
              <MetricExplorerEmpty
                filtered={Boolean(metricSearch)}
                href={ingestSettingsHref}
                onClear={() => {
                  setMetricSearch("");
                  setParam("query", null);
                }}
              />
            ) : null}
            <MetricList
              metrics={metricNames}
              onSelectMetric={selectMetric}
              selectedMetricName={state.metricName}
            />
            <InfiniteScrollSentinel
              hasMore={namesQuery.hasNextPage}
              isLoading={namesQuery.isFetchingNextPage}
              label={t("actions.loadMore")}
              loadingLabel={t("actions.loadingMore")}
              onLoadMore={() => void namesQuery.fetchNextPage()}
            />
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          <MetricQueryControls
            descriptor={selectedMetric}
            onChange={setParam}
            onGroupByChange={setGroupBy}
            state={{ ...effectiveState, groupBy: sanitizedGroupBy }}
          />
          <section className="min-h-0 flex-1 overflow-auto border bg-background">
            {!state.metricName ? (
              <CenteredMessage
                title={t("metrics.empty.noSelection.title")}
                description={t("metrics.empty.noSelection.description")}
              />
            ) : null}
            {state.metricName && !selectedMetric && namesQuery.isSuccess ? (
              <CenteredMessage
                title={t("metrics.empty.selectedMissing.title")}
                description={t("metrics.empty.selectedMissing.description")}
              />
            ) : null}
            {seriesQuery.isLoading ? <LoadingRows /> : null}
            {seriesQuery.isError ? (
              <ErrorPanel error={seriesQuery.error} onRetry={() => void seriesQuery.refetch()} />
            ) : null}
            {seriesQuery.isSuccess ? (
              <MetricSeriesExplorer result={seriesQuery.data} chartType={state.chartType} />
            ) : null}
          </section>
        </main>

        <MetricInspector
          descriptor={selectedMetric}
          groupBy={sanitizedGroupBy}
          onGroupByChange={setGroupBy}
          onTabChange={setInspectorTab}
          result={seriesQuery.data ?? null}
          tab={inspectorTab}
        />
      </div>
    </section>
  );
}

function MetricTimeRangePopover({
  from,
  onChange,
  to,
}: {
  from: string;
  onChange: (key: string, value: string | null) => void;
  to: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontal data-icon="inline-start" />
          {t("filters.more")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px]">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="metric-from">{t("filters.from")}</FieldLabel>
            <Input
              id="metric-from"
              onChange={(event) => onChange("from", event.target.value)}
              value={from}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="metric-to">{t("filters.to")}</FieldLabel>
            <Input
              id="metric-to"
              onChange={(event) => onChange("to", event.target.value)}
              value={to}
            />
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}

function withMetricDescriptorDefaults(
  state: MetricQueryState,
  descriptor: MetricDescriptor,
  explicit: { hasAggregation: boolean; hasFrom: boolean; hasTo: boolean },
): MetricQueryState {
  const observedRange = createObservedMetricRange(descriptor);
  return {
    ...state,
    aggregation: explicit.hasAggregation ? state.aggregation : defaultMetricAggregation(descriptor),
    from: explicit.hasFrom ? state.from : observedRange.from,
    to: explicit.hasTo ? state.to : observedRange.to,
  };
}

function stringOrNull(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function attributeFilters(searchParams: URLSearchParams): AttributeFilterInput[] {
  const key = stringOrNull(searchParams.get("filterKey"));
  return key ? [{ key, operator: "exists" }] : [];
}
