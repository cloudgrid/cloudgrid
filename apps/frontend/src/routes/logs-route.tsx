import type { LogEvent } from "@cloudgrid/ui-contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardCopy, RefreshCw, X } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
import { RouteBreadcrumb } from "../components/route-breadcrumb";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { LogFilters } from "../features/logs/log-filters";
import { LogInspector, LogTable } from "../features/logs/log-table";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useLogFilters } from "../lib/url-filters";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

export function LogsRoute() {
  const client = useTelemetryClient();
  const { viewer } = useAppSession();
  const ingestSettingsHref = viewer?.selectedProject
    ? `/projects/${encodeURIComponent(viewer.selectedProject.id)}/settings/ingest`
    : "/projects";
  const { filters, searchParams, setFilter, clearFilters } = useLogFilters();
  const [, setSearchParams] = useSearchParams();
  const selectedLogId = searchParams.get("logId");
  const inspectorTab = logInspectorTabOrDefault(searchParams.get("tab"));
  const filtered = hasActiveFiltersForLogs(searchParams);
  const facetInput = {
    from: filters.from ?? null,
    to: filters.to ?? null,
    service: filters.service ?? null,
    search: filters.search ?? null,
    limit: 50,
  };
  const debouncedFacetInput = useDebouncedValue(facetInput, 250);
  const query = useQuery({
    queryKey: queryKeys.logs(filters),
    queryFn: () => client.searchLogs(filters),
  });
  const facetsQuery = useQuery({
    queryKey: queryKeys.telemetryFacets(debouncedFacetInput),
    queryFn: () => client.getTelemetryFacets(debouncedFacetInput),
  });
  const selectedLog = useMemo<LogEvent | null>(
    () => query.data?.items.find((log) => log.id === selectedLogId) ?? null,
    [query.data, selectedLogId],
  );
  const selectLog = (log: LogEvent) => {
    setSearchParams((params) => {
      params.set("logId", log.id);
      if (!params.get("tab")) {
        params.set("tab", "body");
      }
      return params;
    });
  };
  const setInspectorTab = (tab: "body" | "attributes" | "correlation") => {
    setSearchParams((params) => {
      params.set("tab", tab);
      return params;
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="min-w-0 space-y-2">
          <RouteBreadcrumb
            backLabel={t("actions.back")}
            backTo="/projects"
            items={[
              { label: t("nav.projects"), to: "/projects" },
              { label: viewer?.selectedProject?.name ?? t("projects.select"), to: "/projects" },
              { label: t("logs.title") },
            ]}
          />
          <h1 className="text-xl font-semibold tracking-normal">{t("logs.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("logs.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label={t("logs.refresh")}
            onClick={() => void query.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      <LogFilters
        facets={facetsQuery.data}
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
      />
      <ResizablePanelGroup className="min-h-0 flex-1 border bg-background" orientation="horizontal">
        <ResizablePanel defaultSize="68%" minSize="45%">
          <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            <div className="min-h-0 flex-1 overflow-auto">
              {query.isLoading ? <LoadingRows /> : null}
              {query.isError ? (
                <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
              ) : null}
              {query.isSuccess && query.data.items.length === 0 && filtered ? (
                <EmptyState
                  filtered={filtered}
                  title={t("logs.empty.filtered.title")}
                  description={t("logs.empty.filtered.description")}
                  primaryAction={
                    <Button onClick={clearFilters}>
                      <X data-icon="inline-start" />
                      {t("filters.clear")}
                    </Button>
                  }
                />
              ) : null}
              {query.isSuccess && query.data.items.length === 0 && !filtered ? (
                <EmptyState
                  filtered={filtered}
                  title={t("logs.empty.noLogs.title")}
                  description={t("logs.empty.noLogs.description")}
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
              {query.isSuccess && query.data.items.length > 0 ? (
                <LogTable
                  onSelectLog={selectLog}
                  onSortChange={(value) => setFilter("sort", value)}
                  result={query.data}
                  selectedLogId={selectedLogId}
                  sort={filters.sort ?? "timestamp_desc"}
                />
              ) : null}
            </div>
            {query.isSuccess && query.data.nextCursor ? (
              <div className="flex shrink-0 justify-end border-t bg-background px-3 py-2">
                <Button
                  onClick={() => setFilter("cursor", query.data.nextCursor ?? null)}
                  variant="outline"
                >
                  <ArrowRight data-icon="inline-start" />
                  {t("actions.nextPage")}
                </Button>
              </div>
            ) : null}
          </section>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize="420px"
          groupResizeBehavior="preserve-pixel-size"
          maxSize="640px"
          minSize="360px"
        >
          <LogInspector log={selectedLog} onTabChange={setInspectorTab} tab={inspectorTab} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
}

export function logInspectorTabOrDefault(
  value: string | null,
): "body" | "attributes" | "correlation" {
  return value === "attributes" || value === "correlation" ? value : "body";
}

export function hasActiveFiltersForLogs(searchParams: URLSearchParams) {
  for (const key of searchParams.keys()) {
    if (key !== "cursor" && key !== "logId" && key !== "tab") {
      return true;
    }
  }

  return false;
}
