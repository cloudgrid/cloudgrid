import type {
  JSONValue,
  LiveTraceInput,
  LogSearchInput,
  MetricChartType,
  MetricNameSearchInput,
  MetricSeriesInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Copy,
  Edit3,
  LineChart,
  ListTree,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Star,
  StarOff,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingRows } from "../components/query-state";
import { RouteBreadcrumb } from "../components/route-breadcrumb";
import { SearchInput } from "../components/search-input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { TelemetryChart, type TelemetryChartKind } from "../features/telemetry/telemetry-chart";
import type {
  Dashboard,
  DashboardVisibility,
  DashboardWidget,
  DashboardWidgetInput,
  DashboardWidgetKind,
  SaveDashboardInput,
} from "../lib/dashboard-contracts";
import { notifyMutationError, notifyMutationSuccess } from "../lib/feedback";
import { formatDateTime, formatDuration, jsonPreview, statusVariant } from "../lib/format";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

export function DashboardsRoute() {
  const { client, viewer } = useAppSession();
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [draft, setDraft] = useState<SaveDashboardInput | null>(null);
  const [inspectorWidgetId, setInspectorWidgetId] = useState<string | null>(null);
  const [pendingDashboardId, setPendingDashboardId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const dashboardId = searchParams.get("dashboard");
  const range = {
    from: searchParams.get("from") ?? new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to: searchParams.get("to") ?? new Date().toISOString(),
  };
  const dashboardsQuery = useQuery({
    queryKey: queryKeys.dashboards({ includeBuiltins: true, query: query || null }),
    queryFn: () => client.getDashboards({ includeBuiltins: true, query: query || null }),
  });
  const dashboards = dashboardsQuery.data?.items ?? [];
  const selectedDashboard = dashboardId
    ? (dashboards.find((dashboard) => dashboard.id === dashboardId) ?? null)
    : null;
  const widgets = draft?.widgets ?? selectedDashboard?.widgets ?? [];
  const inspectorWidget = widgets.find((widget) => widget.id === inspectorWidgetId) ?? null;
  const saveMutation = useMutation({
    mutationFn: client.saveDashboard,
    onSuccess(dashboard) {
      notifyMutationSuccess("Dashboard saved.");
      setDraft(null);
      setInspectorWidgetId(null);
      void queryClient.invalidateQueries({ queryKey: ["Dashboards"] });
      setSearchParams((params) => {
        params.set("dashboard", dashboard.id);
        return params;
      });
    },
    onError(error) {
      notifyMutationError(error, "Dashboard could not be saved.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: client.deleteDashboard,
    onSuccess() {
      notifyMutationSuccess("Dashboard deleted.");
      setDraft(null);
      setInspectorWidgetId(null);
      void queryClient.invalidateQueries({ queryKey: ["Dashboards"] });
      setSearchParams((params) => {
        params.delete("dashboard");
        return params;
      });
    },
    onError(error) {
      notifyMutationError(error, "Dashboard could not be deleted.");
    },
  });
  const pinMutation = useMutation({
    mutationFn: client.setDashboardPinned,
    onSuccess() {
      notifyMutationSuccess("Dashboard pin updated.");
      void queryClient.invalidateQueries({ queryKey: ["Dashboards"] });
    },
    onError(error) {
      notifyMutationError(error, "Dashboard pin could not be updated.");
    },
  });

  const commitDashboardSelection = (id: string) => {
    setDraft(null);
    setInspectorWidgetId(null);
    setSearchParams((params) => {
      params.set("dashboard", id);
      params.delete("widget");
      params.delete("inspector");
      return params;
    });
  };
  const selectDashboard = (id: string) => {
    if (draft) {
      setPendingDashboardId(id);
      return;
    }
    commitDashboardSelection(id);
  };
  const createDashboard = () => {
    setDraft({
      name: t("dashboards.untitled"),
      description: null,
      tags: [],
      visibility: "personal",
      defaultTimeWindow: "PT1H",
      widgets: [],
    });
    setInspectorWidgetId(null);
    setSearchParams((params) => {
      params.delete("dashboard");
      params.set("mode", "edit");
      return params;
    });
  };
  const duplicateDashboard = () => {
    if (!selectedDashboard) {
      return;
    }
    setDraft(duplicateDashboardDraft(selectedDashboard));
    setInspectorWidgetId(null);
  };
  const deleteDashboard = () => {
    if (!selectedDashboard) {
      return;
    }
    void deleteMutation.mutate(selectedDashboard.id);
  };
  const addWidget = (kind: DashboardWidgetKind) => {
    setDraft((current) => {
      const next = appendWidget(current ?? duplicateDashboardDraft(selectedDashboard), kind);
      const widget = next.widgets.at(-1);
      if (widget) {
        setInspectorWidgetId(widget.id);
        setSearchParams((params) => {
          params.set("widget", widget.id);
          params.set("inspector", "edit");
          return params;
        });
      }
      return next;
    });
  };
  const updateWidget = (widget: DashboardWidgetInput) => {
    setDraft((current) => {
      const base = current ?? duplicateDashboardDraft(selectedDashboard);
      return {
        ...base,
        widgets: base.widgets.map((candidate) => (candidate.id === widget.id ? widget : candidate)),
      };
    });
  };
  const openWidgetInspector = (widgetId: string) => {
    setInspectorWidgetId(widgetId);
    setSearchParams((params) => {
      params.set("widget", widgetId);
      params.set("inspector", "edit");
      return params;
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="min-w-0 space-y-2">
          <RouteBreadcrumb
            backLabel={t("actions.back")}
            backTo="/projects"
            items={[
              { label: t("nav.projects"), to: "/projects" },
              { label: viewer?.selectedProject?.name ?? t("projects.select"), to: "/projects" },
              { label: t("dashboards.title") },
            ]}
          />
          <h1 className="text-xl font-semibold tracking-normal">{t("dashboards.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboards.description")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-48">
            <FieldLabel htmlFor="dashboard-from">{t("dashboards.from")}</FieldLabel>
            <Input
              id="dashboard-from"
              onChange={(event) => updateParam(setSearchParams, "from", event.target.value)}
              value={range.from}
            />
          </Field>
          <Field className="w-48">
            <FieldLabel htmlFor="dashboard-to">{t("dashboards.to")}</FieldLabel>
            <Input
              id="dashboard-to"
              onChange={(event) => updateParam(setSearchParams, "to", event.target.value)}
              value={range.to}
            />
          </Field>
          <Button
            aria-label={t("dashboards.refresh")}
            onClick={() => void dashboardsQuery.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw />
          </Button>
          {selectedDashboard ? (
            <Button onClick={duplicateDashboard} type="button" variant="outline">
              <Copy data-icon="inline-start" />
              {t("dashboards.duplicate")}
            </Button>
          ) : null}
          {draft ? (
            <Badge data-dashboard-dirty="true" variant="secondary">
              {t("dashboards.unsavedChanges")}
            </Badge>
          ) : null}
          {draft ? (
            <Button
              disabled={saveMutation.isPending}
              onClick={() => void saveMutation.mutate(draft)}
            >
              <Save data-icon="inline-start" />
              {t("dashboards.save")}
            </Button>
          ) : null}
          {selectedDashboard && selectedDashboard.visibility !== "builtin" ? (
            <Button onClick={() => setDeleteDialogOpen(true)} type="button" variant="outline">
              <Trash2 data-icon="inline-start" />
              {t("dashboards.delete")}
            </Button>
          ) : null}
        </div>
      </header>

      {!selectedDashboard && !draft ? (
        <DashboardOverview
          dashboards={dashboards}
          isLoading={dashboardsQuery.isLoading}
          onCreate={createDashboard}
          onPin={(dashboard) =>
            void pinMutation.mutate({ dashboardId: dashboard.id, pinned: !dashboard.pinned })
          }
          onQueryChange={(value) => {
            setQuery(value);
            updateParam(setSearchParams, "query", value);
          }}
          onRetry={() => void dashboardsQuery.refetch()}
          onSelect={selectDashboard}
          query={query}
          queryError={dashboardsQuery.error}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <main className="min-h-0 min-w-0 overflow-auto border bg-background p-3">
            {dashboardsQuery.isLoading ? <LoadingRows /> : null}
            {dashboardsQuery.isError ? (
              <ErrorPanel
                error={dashboardsQuery.error}
                onRetry={() => void dashboardsQuery.refetch()}
              />
            ) : null}
            {selectedDashboard || draft ? (
              <DashboardCanvas
                dashboard={selectedDashboard}
                draft={draft}
                onAddWidget={addWidget}
                onDraftChange={setDraft}
                onEditWidget={openWidgetInspector}
                range={range}
                telemetryClient={telemetryClient}
                widgets={widgets}
              />
            ) : null}
          </main>

          <WidgetEditorSheet
            dashboard={selectedDashboard}
            draft={draft}
            onDraftChange={setDraft}
            onOpenChange={(open) => {
              if (!open) {
                setInspectorWidgetId(null);
              }
            }}
            onWidgetChange={updateWidget}
            open={Boolean(inspectorWidget)}
            widget={inspectorWidget}
          />
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDashboardId(null);
          }
        }}
        open={Boolean(pendingDashboardId)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboards.discard.title")}</DialogTitle>
            <DialogDescription>{t("dashboards.discard.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X data-icon="inline-start" />
                {t("dashboards.keepEditing")}
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (pendingDashboardId) {
                  commitDashboardSelection(pendingDashboardId);
                }
                setPendingDashboardId(null);
              }}
              type="button"
            >
              <Trash2 data-icon="inline-start" />
              {t("dashboards.discard.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboards.deleteDialog.title")}</DialogTitle>
            <DialogDescription>{t("dashboards.deleteDialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X data-icon="inline-start" />
                {t("actions.cancel")}
              </Button>
            </DialogClose>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteDashboard();
                setDeleteDialogOpen(false);
              }}
              type="button"
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" />
              {t("dashboards.deleteDialog.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DashboardOverview({
  dashboards,
  isLoading,
  onCreate,
  onPin,
  onQueryChange,
  onRetry,
  onSelect,
  query,
  queryError,
}: {
  dashboards: Dashboard[];
  isLoading: boolean;
  onCreate: () => void;
  onPin: (dashboard: Dashboard) => void;
  onQueryChange: (value: string) => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  query: string;
  queryError: unknown;
}) {
  const groups: Array<[string, DashboardVisibility | "pinned"]> = [
    [t("dashboards.rail.pinned"), "pinned"],
    [t("dashboards.rail.builtin"), "builtin"],
    [t("dashboards.rail.personal"), "personal"],
    [t("dashboards.rail.project"), "project"],
  ];

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
          <Field className="max-w-md">
            <FieldLabel htmlFor="dashboard-search">{t("dashboards.search.label")}</FieldLabel>
            <SearchInput
              id="dashboard-search"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("dashboards.search.placeholder")}
              value={query}
            />
          </Field>
          <Button onClick={onCreate} type="button">
            <Plus data-icon="inline-start" />
            {t("dashboards.create")}
          </Button>
        </div>
        {isLoading ? <LoadingRows /> : null}
        {queryError ? <ErrorPanel error={queryError} onRetry={onRetry} /> : null}
        {!isLoading && dashboards.length === 0 ? (
          <EmptyDashboardCanvas onCreate={onCreate} />
        ) : null}
        {groups.map(([title, visibility]) => {
          const groupDashboards = dashboards.filter((dashboard) =>
            visibility === "pinned" ? dashboard.pinned : dashboard.visibility === visibility,
          );
          if (groupDashboards.length === 0) {
            return null;
          }
          return (
            <section className="flex flex-col gap-3" key={title}>
              <h2 className="text-sm font-semibold">{title}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupDashboards.map((dashboard) => (
                  <div
                    className="group relative min-h-36 rounded-md border bg-background transition-colors hover:bg-accent hover:text-accent-foreground"
                    key={`${title}:${dashboard.id}`}
                  >
                    <Button
                      className="flex h-full min-h-36 w-full flex-col items-stretch justify-between whitespace-normal p-4 pr-12 text-left"
                      onClick={() => onSelect(dashboard.id)}
                      type="button"
                      variant="ghost"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{dashboard.name}</span>
                        <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {dashboard.description || t("dashboards.reusableDescription")}
                        </span>
                      </span>
                      <span className="mt-4 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{dashboard.visibility}</Badge>
                        <span>
                          {dashboard.widgets.length} {t("dashboards.widgets")}
                        </span>
                        {dashboard.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    </Button>
                    <Button
                      aria-label={dashboard.pinned ? t("dashboards.unpin") : t("dashboards.pin")}
                      className="absolute top-3 right-3"
                      onClick={() => onPin(dashboard)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      {dashboard.pinned ? <StarOff /> : <Star />}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function DashboardCanvas({
  dashboard,
  draft,
  onAddWidget,
  onDraftChange,
  onEditWidget,
  range,
  telemetryClient,
  widgets,
}: {
  dashboard: Dashboard | null;
  draft: SaveDashboardInput | null;
  onAddWidget: (kind: DashboardWidgetKind) => void;
  onDraftChange: (draft: SaveDashboardInput | null) => void;
  onEditWidget: (widgetId: string) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  widgets: Array<DashboardWidget | SaveDashboardInput["widgets"][number]>;
}) {
  const editableDashboard = draft ?? dashboard;
  const updateDashboardDraft = (patch: Partial<SaveDashboardInput>) => {
    onDraftChange({
      ...(draft ?? duplicateDashboardDraft(dashboard)),
      ...patch,
    });
  };

  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <Input
            aria-label={t("dashboards.name")}
            className="h-10 border-transparent px-0 text-lg font-semibold shadow-none focus-visible:border-input focus-visible:px-3"
            onChange={(event) => updateDashboardDraft({ name: event.target.value })}
            value={editableDashboard?.name ?? t("dashboards.untitled")}
          />
          <Textarea
            aria-label={t("dashboards.descriptionField")}
            className="min-h-10 resize-none border-transparent px-0 py-1 text-sm text-muted-foreground shadow-none focus-visible:border-input focus-visible:px-3"
            onChange={(event) =>
              updateDashboardDraft({ description: stringOrNull(event.target.value) })
            }
            placeholder={t("dashboards.descriptionPlaceholder")}
            value={editableDashboard?.description ?? ""}
          />
        </div>
        <AddWidgetButton onAddWidget={onAddWidget} />
      </div>
      {widgets.length === 0 ? (
        <EmptyDashboardCanvas onCreate={() => onAddWidget("metric_timeseries")} />
      ) : (
        <div className="grid auto-rows-[minmax(220px,auto)] grid-cols-12 gap-3">
          {widgets.map((widget) => (
            <DashboardWidgetFrame
              key={widget.id}
              onEdit={() => onEditWidget(widget.id)}
              range={range}
              telemetryClient={telemetryClient}
              widget={widget}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardWidgetFrame({
  onEdit,
  range,
  telemetryClient,
  widget,
}: {
  onEdit: () => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  widget: DashboardWidget | SaveDashboardInput["widgets"][number];
}) {
  const layout = widget.layout;
  const metric = widget.metric;
  const logs = widget.logs;
  const traces = widget.traces;
  const liveTraces = widget.liveTraces;
  const metricDescriptorInput: MetricNameSearchInput | null = metric
    ? {
        query: metric.metricName,
        from: range.from,
        to: range.to,
        limit: 20,
      }
    : null;
  const metricInput: MetricSeriesInput | null = metric
    ? {
        metricName: metric.metricName,
        from: range.from,
        to: range.to,
        aggregation: metric.aggregation,
        groupBy: metric.groupBy ?? [],
        filters: metric.filters ?? [],
        limit: metric.maxSeries ?? 1000,
        ...(metric.interval ? { interval: metric.interval } : {}),
      }
    : null;
  const metricDescriptorQuery = useQuery({
    enabled: Boolean(metricDescriptorInput),
    queryKey: metricDescriptorInput
      ? queryKeys.metricNames(metricDescriptorInput)
      : ["MetricNames", "dashboard-idle"],
    queryFn: () => telemetryClient.getMetricNames(metricDescriptorInput as MetricNameSearchInput),
  });
  const metricDescriptorExists =
    metricDescriptorQuery.data?.items.some(
      (descriptor) => descriptor.name === metric?.metricName,
    ) ?? false;
  const logInput: LogSearchInput | null = logs
    ? {
        service: logs.service ?? null,
        traceId: logs.traceId ?? null,
        spanId: logs.spanId ?? null,
        severity: logs.severity ?? null,
        from: range.from,
        to: range.to,
        search: logs.search ?? null,
        attributes: logs.attributes ?? [],
        sort: logs.sort ?? "timestamp_desc",
        limit: logs.limit ?? 50,
      }
    : null;
  const traceInput: TraceSearchInput | null = traces
    ? {
        service: traces.service ?? null,
        query: traces.query ?? null,
        operationName: traces.operationName ?? null,
        spanName: traces.spanName ?? null,
        from: range.from,
        to: range.to,
        status: traces.status ?? null,
        minDurationMs: traces.minDurationMs ?? null,
        maxDurationMs: traces.maxDurationMs ?? null,
        attributes: traces.attributes ?? [],
        sort: traces.sort ?? "startedAt_desc",
        limit: traces.limit ?? 50,
      }
    : null;
  const liveTraceInput: LiveTraceInput | null = liveTraces
    ? {
        service: liveTraces.service ?? null,
        query: liveTraces.query ?? null,
        operationName: liveTraces.operationName ?? null,
        spanName: liveTraces.spanName ?? null,
        from: range.from,
        status: liveTraces.status ?? null,
        minDurationMs: liveTraces.minDurationMs ?? null,
        maxDurationMs: liveTraces.maxDurationMs ?? null,
        attributes: liveTraces.attributes ?? [],
        limit: liveTraces.limit ?? 50,
      }
    : null;
  const metricQuery = useQuery({
    enabled: Boolean(metricInput && metricDescriptorExists),
    queryKey: metricInput
      ? queryKeys.metricSeries(metricInput)
      : ["MetricSeries", "dashboard-idle"],
    queryFn: () => telemetryClient.getMetricSeries(metricInput as MetricSeriesInput),
  });
  const logQuery = useQuery({
    enabled: Boolean(logInput),
    queryKey: logInput ? queryKeys.logs(logInput) : ["LogSearch", "dashboard-idle"],
    queryFn: () => telemetryClient.searchLogs(logInput as LogSearchInput),
  });
  const traceQuery = useQuery({
    enabled: Boolean(traceInput),
    queryKey: traceInput ? queryKeys.traces(traceInput) : ["TraceSearch", "dashboard-idle"],
    queryFn: () => telemetryClient.searchTraces(traceInput as TraceSearchInput),
  });

  return (
    <section
      className="col-span-12 flex min-h-56 flex-col overflow-hidden border bg-background lg:col-span-6"
      style={{
        gridColumn: `${Math.max(1, layout.x + 1)} / span ${Math.min(12, Math.max(layout.minW ?? 3, layout.w))}`,
        gridRow: `span ${Math.max(layout.minH ?? 2, layout.h)}`,
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{widget.title}</h3>
          <p className="text-xs text-muted-foreground">{widget.kind}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label={t("dashboards.widget.edit")}
            onClick={onEdit}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Edit3 />
          </Button>
          <Button
            aria-label={t("dashboards.widget.more")}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {metric ? (
          metricDescriptorQuery.isLoading ? (
            <LoadingRows />
          ) : metricDescriptorQuery.isError ? (
            <ErrorPanel
              error={metricDescriptorQuery.error}
              onRetry={() => void metricDescriptorQuery.refetch()}
            />
          ) : !metricDescriptorExists ? (
            <p className="text-sm text-muted-foreground">{t("dashboards.metric.noSeries")}</p>
          ) : (
            <QueryWidgetState
              error={metricQuery.error}
              isError={metricQuery.isError}
              isLoading={metricQuery.isLoading}
              onRetry={() => void metricQuery.refetch()}
            >
              {metricQuery.isSuccess ? (
                <MetricWidgetPreview
                  result={metricQuery.data}
                  visualization={metric.visualization}
                />
              ) : null}
            </QueryWidgetState>
          )
        ) : null}
        {logs ? (
          <QueryWidgetState
            error={logQuery.error}
            isError={logQuery.isError}
            isLoading={logQuery.isLoading}
            onRetry={() => void logQuery.refetch()}
          >
            {logQuery.isSuccess ? <LogWidgetPreview result={logQuery.data} /> : null}
          </QueryWidgetState>
        ) : null}
        {traces ? (
          <QueryWidgetState
            error={traceQuery.error}
            isError={traceQuery.isError}
            isLoading={traceQuery.isLoading}
            onRetry={() => void traceQuery.refetch()}
          >
            {traceQuery.isSuccess ? <TraceWidgetPreview result={traceQuery.data} /> : null}
          </QueryWidgetState>
        ) : null}
        {liveTraceInput ? (
          <LiveTraceWidgetPreview input={liveTraceInput} telemetryClient={telemetryClient} />
        ) : null}
        {!metric && !logs && !traces && !liveTraceInput ? <WidgetSummary widget={widget} /> : null}
      </div>
    </section>
  );
}

function QueryWidgetState({
  children,
  error,
  isError,
  isLoading,
  onRetry,
}: {
  children: ReactNode;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      {isLoading ? <LoadingRows /> : null}
      {isError ? <ErrorPanel error={error} onRetry={onRetry} /> : null}
      {children}
    </>
  );
}

function MetricWidgetPreview({
  result,
  visualization,
}: {
  result: Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["getMetricSeries"]>>;
  visualization: MetricChartType;
}) {
  if (result.series.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboards.metric.noSeries")}</p>;
  }

  if (visualization === "stat") {
    const latest = latestMetricPoint(result);
    return (
      <div className="flex h-full min-h-40 flex-col justify-center gap-2">
        <span className="text-sm text-muted-foreground">{result.metric.name}</span>
        <span className="text-3xl font-semibold tabular-nums">
          {latest ? latest.value.toLocaleString() : t("value.none")}
        </span>
        <span className="text-xs text-muted-foreground">
          {latest?.timestamp ?? result.metric.lastSeenAt}
        </span>
      </div>
    );
  }

  if (visualization === "table") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("metrics.groupBy")}</TableHead>
            <TableHead>{t("metrics.series.timestamp")}</TableHead>
            <TableHead>{t("metrics.series.value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.series.slice(0, 8).map((series) => {
            const point = series.points.at(-1);
            return (
              <TableRow key={JSON.stringify(series.labels)}>
                <TableCell className="max-w-48 truncate font-mono text-xs">
                  {seriesLabel(series.labels)}
                </TableCell>
                <TableCell>{point?.timestamp ?? t("value.none")}</TableCell>
                <TableCell className="font-mono">{point?.value ?? t("value.none")}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const chart = buildMetricChartData(result, visualization);

  return (
    <TelemetryChart
      chartClassName="h-60 min-h-60"
      data={chart.data}
      emptyMessage={t("dashboards.metric.noSeries")}
      kind={chart.kind}
      series={chart.series}
      summary={`${result.metric.name} ${visualization} chart with ${result.series.length} ${t(
        "dashboards.metric.series",
      )}.`}
    />
  );
}

type MetricSeriesResultData = Awaited<
  ReturnType<ReturnType<typeof useTelemetryClient>["getMetricSeries"]>
>;

function latestMetricPoint(result: MetricSeriesResultData) {
  return result.series
    .flatMap((series) => series.points)
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp))
    .at(-1);
}

function seriesLabel(labels: JSONValue) {
  if (!labels || (typeof labels === "object" && Object.keys(labels).length === 0)) {
    return t("value.all");
  }
  return jsonPreview(labels);
}

function buildMetricChartData(result: MetricSeriesResultData, visualization: MetricChartType) {
  if (visualization === "pie") {
    return {
      kind: "pie" as TelemetryChartKind,
      data: result.series.map((series) => ({
        label: seriesLabel(series.labels),
        value: series.points.at(-1)?.value ?? 0,
      })),
      series: [{ key: "value", label: result.metric.name }],
    };
  }

  const timestamps = Array.from(
    new Set(result.series.flatMap((series) => series.points.map((point) => point.timestamp))),
  ).sort();
  const series = result.series.slice(0, 8).map((metricSeries, index) => ({
    key: `series_${index}`,
    label: seriesLabel(metricSeries.labels),
  }));
  const data = timestamps.map((timestamp) => {
    const row: Record<string, number | string | null> = { label: timestamp };
    result.series.slice(0, 8).forEach((metricSeries, index) => {
      row[`series_${index}`] =
        metricSeries.points.find((point) => point.timestamp === timestamp)?.value ?? null;
    });
    return row as { label: string } & Record<string, number | string | null>;
  });

  return {
    kind: visualization as TelemetryChartKind,
    data,
    series,
  };
}

function LogWidgetPreview({
  result,
}: {
  result: Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchLogs"]>>;
}) {
  if (result.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("state.empty.filtered.title")}</p>;
  }

  return (
    <div className="grid gap-2 text-xs">
      {result.items.slice(0, 8).map((log) => (
        <div
          className="grid grid-cols-[7.5rem_5rem_minmax(0,1fr)] gap-2 border-b pb-2"
          key={log.id}
        >
          <span className="truncate text-muted-foreground" title={log.timestamp}>
            {formatDateTime(log.timestamp)}
          </span>
          <Badge variant="outline">{log.severityText ?? log.severityNumber ?? "-"}</Badge>
          <span className="min-w-0">
            <span className="block truncate">{log.serviceName ?? t("value.unknown")}</span>
            <code className="block truncate text-muted-foreground">{jsonPreview(log.body)}</code>
          </span>
        </div>
      ))}
    </div>
  );
}

function TraceWidgetPreview({
  result,
}: {
  result: Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchTraces"]>>;
}) {
  if (result.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("state.empty.filtered.title")}</p>;
  }

  return (
    <div className="grid gap-2 text-xs">
      {result.items.slice(0, 8).map((trace) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 border-b pb-2"
          key={trace.id}
        >
          <span className="min-w-0">
            <span className="block truncate">{trace.serviceName ?? t("value.unknown")}</span>
            <code className="block truncate text-muted-foreground">{trace.id}</code>
          </span>
          <span className="font-mono">{formatDuration(trace.durationMs)}</span>
          <Badge variant={statusVariant(trace.status)}>{trace.status ?? t("value.unknown")}</Badge>
        </div>
      ))}
    </div>
  );
}

function LiveTraceWidgetPreview({
  input,
  telemetryClient,
}: {
  input: LiveTraceInput;
  telemetryClient: ReturnType<typeof useTelemetryClient>;
}) {
  const inputKey = JSON.stringify(input);
  const [rows, setRows] = useState<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchTraces"]>>["items"]
  >([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [subscriptionError, setSubscriptionError] = useState<unknown>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    void retryNonce;
    const subscriptionInput = JSON.parse(inputKey) as LiveTraceInput;
    const limit = subscriptionInput.limit ?? 50;
    setRows([]);
    setConnectionState("connecting");
    setSubscriptionError(null);

    const subscription = telemetryClient.subscribeLiveTraces(subscriptionInput, {
      onStateChange: setConnectionState,
      onEvent(event) {
        if (event.type === "heartbeat" || !event.trace) {
          return;
        }
        const trace = event.trace;
        setRows((current) => {
          const deduped = current.filter((candidate) => candidate.id !== trace.id);
          return [trace, ...deduped].slice(0, limit);
        });
      },
      onError(error) {
        setSubscriptionError(error);
        setConnectionState("error");
      },
    });

    return () => subscription.unsubscribe();
  }, [inputKey, retryNonce, telemetryClient]);

  if (subscriptionError) {
    return (
      <ErrorPanel
        error={subscriptionError}
        onRetry={() => setRetryNonce((current) => current + 1)}
      />
    );
  }

  return (
    <div className="grid gap-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline">{connectionState}</Badge>
        <Badge variant="secondary">
          {rows.length} {t("traces.title")}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("live.empty")}</p>
      ) : (
        rows.slice(0, 8).map((trace) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 border-b pb-2"
            key={trace.id}
          >
            <span className="min-w-0">
              <span className="block truncate">{trace.serviceName ?? t("value.unknown")}</span>
              <code className="block truncate text-muted-foreground">{trace.id}</code>
            </span>
            <span className="font-mono">{formatDuration(trace.durationMs)}</span>
            <Badge variant={statusVariant(trace.status)}>
              {trace.status ?? t("value.unknown")}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}

function WidgetEditorSheet({
  dashboard,
  draft,
  onDraftChange,
  onOpenChange,
  onWidgetChange,
  open,
  widget,
}: {
  dashboard: Dashboard | null;
  draft: SaveDashboardInput | null;
  onDraftChange: (draft: SaveDashboardInput | null) => void;
  onOpenChange: (open: boolean) => void;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  open: boolean;
  widget: DashboardWidget | SaveDashboardInput["widgets"][number] | null;
}) {
  const editableWidget = widget ? toWidgetInput(widget) : null;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-auto sm:max-w-[520px]"
        data-dashboard-inspector
        side="right"
      >
        <SheetHeader>
          <SheetTitle>{t("dashboards.details")}</SheetTitle>
          <SheetDescription>
            {draft
              ? t("dashboards.editingDraft")
              : (dashboard?.name ?? t("dashboards.empty.noSelection.title"))}
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 gap-4 px-4">
          {draft ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dashboard-name">{t("dashboards.name")}</FieldLabel>
                <Input
                  id="dashboard-name"
                  onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                  value={draft.name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dashboard-visibility">{t("dashboards.visibility")}</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    onDraftChange({ ...draft, visibility: value as "personal" | "project" })
                  }
                  value={draft.visibility ?? "personal"}
                >
                  <SelectTrigger id="dashboard-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="personal">personal</SelectItem>
                      <SelectItem value="project">project</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          ) : null}
          {editableWidget ? (
            <WidgetEditorGroups
              disabled={!draft}
              onWidgetChange={onWidgetChange}
              widget={editableWidget}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboards.widget.select")}</p>
          )}
        </div>
        <SheetFooter className="px-4">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            <X data-icon="inline-start" />
            {t("actions.close")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AddWidgetButton({ onAddWidget }: { onAddWidget: (kind: DashboardWidgetKind) => void }) {
  const actions: Array<[DashboardWidgetKind, ReactNode, string]> = [
    [
      "metric_timeseries",
      <LineChart data-icon="inline-start" key="metric_timeseries" />,
      t("dashboards.widget.metricChart"),
    ],
    [
      "metric_stat",
      <BarChart3 data-icon="inline-start" key="metric_stat" />,
      t("dashboards.widget.metricStat"),
    ],
    [
      "metric_table",
      <Table2 data-icon="inline-start" key="metric_table" />,
      t("dashboards.widget.metricTable"),
    ],
    [
      "log_table",
      <Table2 data-icon="inline-start" key="log_table" />,
      t("dashboards.widget.logTable"),
    ],
    [
      "trace_table",
      <ListTree data-icon="inline-start" key="trace_table" />,
      t("dashboards.widget.traceTable"),
    ],
    [
      "live_trace_table",
      <RefreshCw data-icon="inline-start" key="live_trace_table" />,
      t("dashboards.widget.liveTraceTable"),
    ],
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button">
          <Plus data-icon="inline-start" />
          {t("dashboards.widget.add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="grid gap-1">
          {actions.map(([kind, icon, label]) => (
            <Button
              className="justify-start"
              key={kind}
              onClick={() => onAddWidget(kind)}
              type="button"
              variant="ghost"
            >
              {icon}
              {label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WidgetEditorGroups({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  return (
    <div className="flex flex-col gap-4">
      <EditorGroup title={t("dashboards.editor.data")}>
        {widget.metric ? (
          <FieldGroup>
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${widget.id}-metric-name`}>
                {t("dashboards.editor.metricName")}
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${widget.id}-metric-name`}
                onChange={(event) =>
                  updateMetricWidget(widget, { metricName: event.target.value }, onWidgetChange)
                }
                value={widget.metric.metricName}
              />
            </Field>
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${widget.id}-metric-aggregation`}>
                {t("dashboards.editor.aggregation")}
              </FieldLabel>
              <Select
                disabled={disabled}
                onValueChange={(value) =>
                  updateMetricWidget(
                    widget,
                    {
                      aggregation: value as NonNullable<typeof widget.metric>["aggregation"],
                    },
                    onWidgetChange,
                  )
                }
                value={widget.metric.aggregation}
              >
                <SelectTrigger id={`${widget.id}-metric-aggregation`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="avg">avg</SelectItem>
                    <SelectItem value="sum">sum</SelectItem>
                    <SelectItem value="min">min</SelectItem>
                    <SelectItem value="max">max</SelectItem>
                    <SelectItem value="count">count</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <SummaryRow label={t("dashboards.editor.groupBy")}>
              {(widget.metric.groupBy ?? []).join(", ") || t("dashboards.noneConfigured")}
            </SummaryRow>
            <SummaryRow label={t("dashboards.editor.filters")}>
              {widget.metric.filters?.length
                ? `${widget.metric.filters.length} ${t("filters.title")}`
                : t("dashboards.noneConfigured")}
            </SummaryRow>
            <SummaryRow label={t("dashboards.editor.interval")}>
              {widget.metric.interval ?? t("dashboards.default")}
            </SummaryRow>
          </FieldGroup>
        ) : widget.logs ? (
          <LogWidgetEditor disabled={disabled} onWidgetChange={onWidgetChange} widget={widget} />
        ) : widget.traces ? (
          <TraceWidgetEditor disabled={disabled} onWidgetChange={onWidgetChange} widget={widget} />
        ) : widget.liveTraces ? (
          <LiveTraceWidgetEditor
            disabled={disabled}
            onWidgetChange={onWidgetChange}
            widget={widget}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("dashboards.widget.noDataSource")}</p>
        )}
      </EditorGroup>
      <EditorGroup title={t("dashboards.editor.display")}>
        <FieldGroup>
          <Field data-disabled={disabled}>
            <FieldLabel htmlFor={`${widget.id}-title`}>{t("dashboards.editor.title")}</FieldLabel>
            <Input
              disabled={disabled}
              id={`${widget.id}-title`}
              onChange={(event) => onWidgetChange({ ...widget, title: event.target.value })}
              value={widget.title}
            />
          </Field>
          {widget.metric ? (
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${widget.id}-visualization`}>
                {t("dashboards.editor.chartType")}
              </FieldLabel>
              <Select
                disabled={disabled}
                onValueChange={(value) =>
                  updateMetricWidget(
                    widget,
                    {
                      visualization: value as NonNullable<typeof widget.metric>["visualization"],
                    },
                    onWidgetChange,
                  )
                }
                value={widget.metric.visualization}
              >
                <SelectTrigger id={`${widget.id}-visualization`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="line">line</SelectItem>
                    <SelectItem value="area">area</SelectItem>
                    <SelectItem value="bar">bar</SelectItem>
                    <SelectItem value="pie">pie</SelectItem>
                    <SelectItem value="stat">stat</SelectItem>
                    <SelectItem value="table">table</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <SummaryRow label={t("dashboards.editor.mode")}>
              {t("dashboards.editor.compactTable")}
            </SummaryRow>
          )}
          <SummaryRow label={t("dashboards.editor.layout")}>
            x {widget.layout.x}, y {widget.layout.y}, w {widget.layout.w}, h {widget.layout.h}
          </SummaryRow>
        </FieldGroup>
      </EditorGroup>
      <EditorGroup title={t("dashboards.editor.thresholds")}>
        {widget.metric ? (
          <WidgetSummary widget={widget} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("dashboards.editor.thresholdsUnavailable")}
          </p>
        )}
      </EditorGroup>
    </div>
  );
}

function EditorGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function updateMetricWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["metric"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.metric) {
    return;
  }
  onWidgetChange({
    ...widget,
    metric: {
      ...widget.metric,
      ...patch,
    },
  });
}

function LogWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.logs) {
    return null;
  }

  return (
    <FieldGroup>
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-log-query`}
        label={t("filters.query")}
        onChange={(value) => updateLogWidget(widget, { search: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.search")}
        search
        value={widget.logs.search}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-log-service`}
        label={t("filters.service")}
        onChange={(value) => updateLogWidget(widget, { service: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.service")}
        value={widget.logs.service}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-log-severity`}
        label={t("filters.severity")}
        onChange={(value) => updateLogWidget(widget, { severity: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.severity")}
        value={widget.logs.severity}
      />
      <NumberWidgetField
        disabled={disabled}
        id={`${widget.id}-log-limit`}
        label="Limit"
        onChange={(value) => updateLogWidget(widget, { limit: value }, onWidgetChange)}
        value={widget.logs.limit}
      />
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-log-sort`}>{t("filters.sort")}</FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            updateLogWidget(
              widget,
              { sort: value as NonNullable<NonNullable<typeof widget.logs>["sort"]> },
              onWidgetChange,
            )
          }
          value={widget.logs.sort ?? "timestamp_desc"}
        >
          <SelectTrigger id={`${widget.id}-log-sort`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="timestamp_desc">timestamp_desc</SelectItem>
              <SelectItem value="timestamp_asc">timestamp_asc</SelectItem>
              <SelectItem value="severity_desc">severity_desc</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

function TraceWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.traces) {
    return null;
  }

  return (
    <FieldGroup>
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-trace-query`}
        label={t("filters.query")}
        onChange={(value) => updateTraceWidget(widget, { query: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.query")}
        search
        value={widget.traces.query}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-trace-service`}
        label={t("filters.service")}
        onChange={(value) => updateTraceWidget(widget, { service: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.service")}
        value={widget.traces.service}
      />
      <StatusWidgetField
        disabled={disabled}
        id={`${widget.id}-trace-status`}
        onChange={(value) => updateTraceWidget(widget, { status: value }, onWidgetChange)}
        value={widget.traces.status}
      />
      <NumberWidgetField
        disabled={disabled}
        id={`${widget.id}-trace-limit`}
        label="Limit"
        onChange={(value) => updateTraceWidget(widget, { limit: value }, onWidgetChange)}
        value={widget.traces.limit}
      />
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-trace-sort`}>{t("filters.sort")}</FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            updateTraceWidget(
              widget,
              {
                sort: value as NonNullable<NonNullable<typeof widget.traces>["sort"]>,
              },
              onWidgetChange,
            )
          }
          value={widget.traces.sort ?? "startedAt_desc"}
        >
          <SelectTrigger id={`${widget.id}-trace-sort`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="startedAt_desc">startedAt_desc</SelectItem>
              <SelectItem value="startedAt_asc">startedAt_asc</SelectItem>
              <SelectItem value="duration_desc">duration_desc</SelectItem>
              <SelectItem value="duration_asc">duration_asc</SelectItem>
              <SelectItem value="errorFirst">errorFirst</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

function LiveTraceWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.liveTraces) {
    return null;
  }

  return (
    <FieldGroup>
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-live-query`}
        label={t("filters.query")}
        onChange={(value) => updateLiveTraceWidget(widget, { query: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.query")}
        search
        value={widget.liveTraces.query}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-live-service`}
        label={t("filters.service")}
        onChange={(value) => updateLiveTraceWidget(widget, { service: value }, onWidgetChange)}
        placeholder={t("filters.placeholder.service")}
        value={widget.liveTraces.service}
      />
      <StatusWidgetField
        disabled={disabled}
        id={`${widget.id}-live-status`}
        onChange={(value) => updateLiveTraceWidget(widget, { status: value }, onWidgetChange)}
        value={widget.liveTraces.status}
      />
      <NumberWidgetField
        disabled={disabled}
        id={`${widget.id}-live-limit`}
        label="Limit"
        onChange={(value) => updateLiveTraceWidget(widget, { limit: value }, onWidgetChange)}
        value={widget.liveTraces.limit}
      />
    </FieldGroup>
  );
}

function TextWidgetField({
  disabled,
  id,
  label,
  onChange,
  placeholder,
  search = false,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string | null) => void;
  placeholder: string;
  search?: boolean;
  value?: string | null | undefined;
}) {
  const Control = search ? SearchInput : Input;
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Control
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(stringOrNull(event.target.value))}
        placeholder={placeholder}
        value={value ?? ""}
      />
    </Field>
  );
}

function NumberWidgetField({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: number | null) => void;
  value?: number | null | undefined;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        disabled={disabled}
        id={id}
        min={1}
        onChange={(event) => onChange(numberOrNull(event.target.value))}
        type="number"
        value={value ?? ""}
      />
    </Field>
  );
}

function StatusWidgetField({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: "ok" | "error" | "unset" | null) => void;
  value?: "ok" | "error" | "unset" | null | undefined;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{t("filters.status")}</FieldLabel>
      <Select
        disabled={disabled}
        onValueChange={(nextValue) =>
          onChange(nextValue === "all" ? null : (nextValue as "ok" | "error" | "unset"))
        }
        value={value ?? "all"}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
            <SelectItem value="ok">ok</SelectItem>
            <SelectItem value="error">error</SelectItem>
            <SelectItem value="unset">unset</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function updateLogWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["logs"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.logs) {
    return;
  }
  onWidgetChange({
    ...widget,
    logs: {
      ...widget.logs,
      ...patch,
    },
  });
}

function updateTraceWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["traces"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.traces) {
    return;
  }
  onWidgetChange({
    ...widget,
    traces: {
      ...widget.traces,
      ...patch,
    },
  });
}

function updateLiveTraceWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["liveTraces"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.liveTraces) {
    return;
  }
  onWidgetChange({
    ...widget,
    liveTraces: {
      ...widget.liveTraces,
      ...patch,
    },
  });
}

function WidgetSummary({
  widget,
}: {
  widget: DashboardWidget | SaveDashboardInput["widgets"][number];
}) {
  return (
    <dl className="grid gap-2 text-sm">
      <SummaryRow label={t("dashboards.editor.title")}>{widget.title}</SummaryRow>
      <SummaryRow label={t("dashboards.kind")}>{widget.kind}</SummaryRow>
      {widget.metric ? (
        <SummaryRow label={t("dashboards.metric.label")}>{widget.metric.metricName}</SummaryRow>
      ) : null}
      {widget.logs ? (
        <SummaryRow label={t("logs.title")}>
          {widget.logs.search ?? widget.logs.service ?? t("dashboards.table")}
        </SummaryRow>
      ) : null}
      {widget.traces ? (
        <SummaryRow label={t("traces.title")}>
          {widget.traces.query ?? widget.traces.service ?? t("dashboards.table")}
        </SummaryRow>
      ) : null}
      {widget.liveTraces ? (
        <SummaryRow label={t("traces.mode.live")}>
          {widget.liveTraces.service ?? t("dashboards.stream")}
        </SummaryRow>
      ) : null}
    </dl>
  );
}

function SummaryRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EmptyDashboardCanvas({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <div>
        <h2 className="font-semibold">{t("dashboards.empty.noSelection.title")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("dashboards.empty.noSelection.description")}
        </p>
      </div>
      <Button onClick={onCreate} type="button">
        <Plus data-icon="inline-start" />
        {t("dashboards.create")}
      </Button>
    </div>
  );
}

function duplicateDashboardDraft(dashboard: Dashboard | null): SaveDashboardInput {
  if (!dashboard) {
    return {
      name: t("dashboards.untitled"),
      description: null,
      tags: [],
      visibility: "personal",
      defaultTimeWindow: "PT1H",
      widgets: [],
    };
  }
  return {
    name: `${dashboard.name} ${t("dashboards.copySuffix")}`,
    description: dashboard.description ?? null,
    tags: [...dashboard.tags],
    visibility: dashboard.visibility === "project" ? "project" : "personal",
    defaultTimeWindow: dashboard.defaultTimeWindow,
    widgets: dashboard.widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      description: widget.description ?? null,
      kind: widget.kind,
      layout: { ...widget.layout },
      metric: widget.metric ? { ...widget.metric } : null,
      logs: widget.logs ? { ...widget.logs } : null,
      traces: widget.traces ? { ...widget.traces } : null,
      liveTraces: widget.liveTraces ? { ...widget.liveTraces } : null,
    })),
  };
}

function appendWidget(draft: SaveDashboardInput, kind: DashboardWidgetKind): SaveDashboardInput {
  const index = draft.widgets.length + 1;
  const base = {
    id: `widget-${index}`,
    title: widgetTitle(kind),
    kind,
    layout: {
      x: ((index - 1) * 6) % 12,
      y: Math.floor((index - 1) / 2) * 4,
      w: 6,
      h: 4,
      minW: 3,
      minH: 2,
    },
  };
  const widget =
    kind === "metric_timeseries" || kind === "metric_stat" || kind === "metric_table"
      ? ({
          ...base,
          metric: {
            metricName: "gen_ai.client.token.usage",
            aggregation: "sum",
            groupBy: [],
            filters: [],
            timeWindow: "PT1H",
            interval: "PT1M",
            visualization:
              kind === "metric_stat" ? "stat" : kind === "metric_table" ? "table" : "line",
            legend: kind === "metric_timeseries",
            maxSeries: 20,
            thresholds: [],
          },
        } satisfies DashboardWidgetInput)
      : kind === "log_table"
        ? ({
            ...base,
            logs: {
              search: null,
              service: null,
              severity: null,
              traceId: null,
              spanId: null,
              attributes: [],
              sort: "timestamp_desc",
              limit: 50,
              columns: ["timestamp", "severity", "service", "trace_span", "body"],
            },
          } satisfies DashboardWidgetInput)
        : kind === "trace_table"
          ? ({
              ...base,
              traces: {
                query: null,
                service: null,
                operationName: null,
                spanName: null,
                status: null,
                minDurationMs: null,
                maxDurationMs: null,
                attributes: [],
                sort: "startedAt_desc",
                limit: 50,
                columns: ["started_at", "status", "service", "operation", "duration"],
              },
            } satisfies DashboardWidgetInput)
          : ({
              ...base,
              liveTraces: {
                query: null,
                service: null,
                operationName: null,
                spanName: null,
                status: null,
                minDurationMs: null,
                maxDurationMs: null,
                attributes: [],
                limit: 50,
              },
            } satisfies DashboardWidgetInput);
  return {
    ...draft,
    widgets: [...draft.widgets, widget],
  };
}

function widgetTitle(kind: DashboardWidgetKind) {
  switch (kind) {
    case "metric_stat":
      return t("dashboards.widget.metricStat");
    case "metric_table":
      return t("dashboards.widget.metricTable");
    case "log_table":
      return t("dashboards.widget.logTable");
    case "trace_table":
      return t("dashboards.widget.traceTable");
    case "live_trace_table":
      return t("dashboards.widget.liveTraceTable");
    case "metric_timeseries":
      return t("dashboards.widget.metricChart");
  }
}

function toWidgetInput(widget: DashboardWidget | DashboardWidgetInput): DashboardWidgetInput {
  return {
    id: widget.id,
    title: widget.title,
    description: widget.description ?? null,
    kind: widget.kind,
    layout: {
      x: widget.layout.x,
      y: widget.layout.y,
      w: widget.layout.w,
      h: widget.layout.h,
      minW: widget.layout.minW ?? null,
      minH: widget.layout.minH ?? null,
    },
    metric: widget.metric ? { ...widget.metric } : null,
    logs: widget.logs ? { ...widget.logs } : null,
    traces: widget.traces ? { ...widget.traces } : null,
    liveTraces: widget.liveTraces ? { ...widget.liveTraces } : null,
  };
}

function updateParam(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  value: string,
) {
  setSearchParams((params) => {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    return params;
  });
}

function stringOrNull(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numberOrNull(value: string | null) {
  const normalized = stringOrNull(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
