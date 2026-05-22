import type {
  AlertEvent,
  AlertSummary,
  AlertSummaryInput,
  JSONValue,
  LiveTraceInput,
  LogSearchInput,
  MetricAggregation,
  MetricChartType,
  MetricDescriptor,
  MetricNameSearchInput,
  MetricSeriesInput,
  RichMetricSeriesInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import {
  METRIC_AGGREGATIONS,
  METRIC_CHART_TYPES,
  buildDashboardListInput,
} from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Clock,
  Copy,
  CopyPlus,
  Edit3,
  GripVertical,
  LineChart,
  ListTree,
  Maximize2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Star,
  StarOff,
  Table2,
  Trash2,
  X,
  FileSearch,
  History,
} from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingRows } from "../components/query-state";
import { SearchInput } from "../components/search-input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Checkbox } from "../components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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
import { Separator } from "../components/ui/separator";
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
import {
  compactDashboardLayout,
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_GRID_ROW_HEIGHT,
  defaultDashboardWidgetLayout,
  sortDashboardWidgetsForSave,
} from "../features/dashboards/dashboard-layout";
import {
  dashboardDraftReducer,
  startDashboardDraft,
  toDashboardSaveInput,
  type DashboardDraftState,
} from "../features/dashboards/dashboard-draft-reducer";
import { TelemetryChart, type TelemetryChartKind } from "../features/telemetry/telemetry-chart";
import type {
  Dashboard,
  DashboardMetricFormulaInput,
  DashboardMetricQueryInput,
  DashboardMetricQueryRowInput,
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

const EMPTY_METRIC_NAME = "gen_ai.client.token.usage";
const RICH_METRIC_EDITING_ENABLED = false;

const metricChartTypes: MetricChartType[] = [...METRIC_CHART_TYPES];

const metricAggregations: MetricAggregation[] = [...METRIC_AGGREGATIONS];

function isRichMetricEditingEnabled() {
  return RICH_METRIC_EDITING_ENABLED;
}

export function DashboardsRoute() {
  const { client } = useAppSession();
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [draftState, setDraftState] = useState<DashboardDraftState | null>(null);
  const [inspectorWidgetId, setInspectorWidgetId] = useState<string | null>(null);
  const [pendingDashboardId, setPendingDashboardId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const dashboardId = searchParams.get("dashboard");
  const [fallbackRange] = useState(defaultDashboardRange);
  const dashboardListInput = buildDashboardListInput({ query });
  const dashboardsQuery = useQuery({
    queryKey: queryKeys.dashboards(dashboardListInput),
    queryFn: () => client.getDashboards(dashboardListInput),
  });
  const dashboards = dashboardsQuery.data?.items ?? [];
  const selectedDashboard = dashboardId
    ? (dashboards.find((dashboard) => dashboard.id === dashboardId) ?? null)
    : null;
  const draft = draftState ? toDashboardSaveInput(draftState) : null;
  const widgets = draftState?.widgets ?? selectedDashboard?.widgets ?? [];
  const dashboardMetricNames = metricNamesForDashboardWidgets(widgets);
  const dashboardMetricDescriptorsQuery = useQuery({
    enabled:
      Boolean(selectedDashboard || draft) &&
      dashboardMetricNames.length > 0 &&
      (!searchParams.has("from") || !searchParams.has("to")),
    queryKey: queryKeys.metricNames({
      query: null,
      service: null,
      from: null,
      to: null,
      limit: 100,
    }),
    queryFn: () =>
      telemetryClient.getMetricNames({
        query: null,
        service: null,
        from: null,
        to: null,
        limit: 100,
      }),
  });
  const observedRange = dashboardObservedMetricRange(
    dashboardMetricDescriptorsQuery.data?.items.filter((descriptor) =>
      dashboardMetricNames.includes(descriptor.name),
    ) ?? [],
  );
  const range = {
    from: searchParams.get("from") ?? observedRange?.from ?? fallbackRange.from,
    to: searchParams.get("to") ?? observedRange?.to ?? fallbackRange.to,
  };
  const inspectorWidget = widgets.find((widget) => widget.id === inspectorWidgetId) ?? null;
  const saveMutation = useMutation({
    mutationFn: client.saveDashboard,
    onSuccess(dashboard) {
      notifyMutationSuccess("Dashboard saved.");
      setDraftState(null);
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
      setDraftState(null);
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
    setDraftState(null);
    setInspectorWidgetId(null);
    setSearchParams((params) => {
      params.set("dashboard", id);
      params.delete("widget");
      params.delete("inspector");
      return params;
    });
  };
  const selectDashboard = (id: string) => {
    if (draftState) {
      setPendingDashboardId(id);
      return;
    }
    commitDashboardSelection(id);
  };
  const createDashboard = () => {
    setDraftState(startDashboardDraft({ source: "new" }));
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
    setDraftState(startDashboardDraft({ dashboard: selectedDashboard, source: "duplicate" }));
    setInspectorWidgetId(null);
  };
  const deleteDashboard = () => {
    if (!selectedDashboard) {
      return;
    }
    void deleteMutation.mutate(selectedDashboard.id);
  };
  const addWidget = (kind: DashboardWidgetKind) => {
    setDraftState((current) => {
      const base = current ?? startDraftForSelectedDashboard(selectedDashboard);
      const widget = createDashboardWidget(kind, base.widgets.length + 1);
      const next = dashboardDraftReducer(base, { type: "add_widget", widget });
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
    setDraftState((current) =>
      dashboardDraftReducer(current ?? startDraftForSelectedDashboard(selectedDashboard), {
        type: "update_widget_data",
        widget,
      }),
    );
  };
  const duplicateWidget = (widgetId: string) => {
    setDraftState((current) => {
      const base = current ?? startDraftForSelectedDashboard(selectedDashboard);
      const widget = duplicateWidgetInput(base.widgets, widgetId);
      return widget ? dashboardDraftReducer(base, { type: "duplicate_widget", widget }) : base;
    });
  };
  const removeWidget = (widgetId: string) => {
    setDraftState((current) =>
      dashboardDraftReducer(current ?? startDraftForSelectedDashboard(selectedDashboard), {
        type: "remove_widget",
        widgetId,
      }),
    );
    setInspectorWidgetId((current) => (current === widgetId ? null : current));
  };
  const moveWidget = (widgetId: string, deltaX: number, deltaY: number) => {
    setDraftState((current) =>
      dashboardDraftReducer(current ?? startDraftForSelectedDashboard(selectedDashboard), {
        type: "move_widget",
        deltaX,
        deltaY,
        widgetId,
      }),
    );
  };
  const resizeWidget = (widgetId: string, deltaWidth: number, deltaHeight: number) => {
    setDraftState((current) =>
      dashboardDraftReducer(current ?? startDraftForSelectedDashboard(selectedDashboard), {
        type: "resize_widget",
        deltaWidth,
        deltaHeight,
        widgetId,
      }),
    );
  };
  const openWidgetInspector = (widgetId: string) => {
    setInspectorWidgetId(widgetId);
    setSearchParams((params) => {
      params.set("widget", widgetId);
      params.set("inspector", "edit");
      return params;
    });
  };
  const updateRange = (nextRange: { from: string; to: string }) => {
    setSearchParams((params) => {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
      return params;
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="min-w-0">
          {draft ? (
            <Input
              aria-label={t("dashboards.name")}
              className="h-9 max-w-xl border-transparent px-0 text-xl font-semibold shadow-none focus-visible:border-input focus-visible:px-3"
              onChange={(event) =>
                setDraftState((current) =>
                  current
                    ? dashboardDraftReducer(current, {
                        type: "update_metadata",
                        patch: { name: event.target.value },
                      })
                    : current,
                )
              }
              value={draft.name}
            />
          ) : (
            <h1 className="truncate text-xl font-semibold tracking-normal">
              {selectedDashboard?.name ?? t("dashboards.title")}
            </h1>
          )}
          {!selectedDashboard && !draft ? (
            <p className="text-sm text-muted-foreground">{t("dashboards.description")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <DashboardDateRangeControl onRangeChange={updateRange} range={range} />
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
              onClick={() => void saveMutation.mutate(prepareDashboardSaveInput(draft))}
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
          <main className="min-h-0 min-w-0 overflow-auto bg-background">
            {dashboardsQuery.isLoading ? <LoadingRows /> : null}
            {dashboardsQuery.isError ? (
              <ErrorPanel
                error={dashboardsQuery.error}
                onRetry={() => void dashboardsQuery.refetch()}
              />
            ) : null}
            {selectedDashboard || draft ? (
              <DashboardCanvas
                onAddWidget={addWidget}
                onDuplicateWidget={duplicateWidget}
                onEditWidget={openWidgetInspector}
                isEditing={Boolean(draft)}
                onMoveWidget={moveWidget}
                onRemoveWidget={removeWidget}
                onResizeWidget={resizeWidget}
                range={range}
                selectedWidgetId={inspectorWidgetId}
                telemetryClient={telemetryClient}
                widgets={widgets}
              />
            ) : null}
          </main>

          <WidgetEditorSheet
            dashboard={selectedDashboard}
            draft={draft}
            onDraftChange={(nextDraft) =>
              setDraftState((current) =>
                current ? syncDraftStateFromSaveInput(current, nextDraft) : current,
              )
            }
            onOpenChange={(open) => {
              if (!open) {
                setInspectorWidgetId(null);
              }
            }}
            onWidgetChange={updateWidget}
            open={Boolean(inspectorWidget)}
            range={range}
            telemetryClient={telemetryClient}
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
          <EmptyDashboardCanvas
            actionLabel={t("dashboards.create")}
            description={t("dashboards.empty.noDashboards.description")}
            onCreate={onCreate}
            title={t("dashboards.empty.noDashboards.title")}
          />
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

function DashboardDateRangeControl({
  onRangeChange,
  range,
}: {
  onRangeChange: (range: { from: string; to: string }) => void;
  range: { from: string; to: string };
}) {
  const fromDate = parseDateValue(range.from);
  const toDate = parseDateValue(range.to);
  const [open, setOpen] = useState(false);
  const [fromTime, setFromTime] = useState(formatTimeInput(fromDate));
  const [toTime, setToTime] = useState(formatTimeInput(toDate));

  useEffect(() => {
    setFromTime(formatTimeInput(parseDateValue(range.from)));
    setToTime(formatTimeInput(parseDateValue(range.to)));
  }, [range.from, range.to]);

  const commitDates = (
    nextFrom: Date | undefined,
    nextTo: Date | undefined,
    times: { fromTime?: string; toTime?: string } = {},
  ) => {
    if (!nextFrom || !nextTo) {
      return;
    }
    const normalizedFrom = withTime(nextFrom, times.fromTime ?? fromTime);
    const normalizedTo = withTime(nextTo, times.toTime ?? toTime);
    if (normalizedFrom.getTime() > normalizedTo.getTime()) {
      onRangeChange({
        from: normalizedTo.toISOString(),
        to: normalizedFrom.toISOString(),
      });
      return;
    }
    onRangeChange({
      from: normalizedFrom.toISOString(),
      to: normalizedTo.toISOString(),
    });
  };

  const selectPreset = (hours: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    setFromTime(formatTimeInput(from));
    setToTime(formatTimeInput(to));
    onRangeChange({ from: from.toISOString(), to: to.toISOString() });
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="min-w-72 justify-start" type="button" variant="outline">
          <CalendarDays data-icon="inline-start" />
          <span className="truncate text-left">
            {formatDateTime(range.from)} - {formatDateTime(range.to)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap gap-2">
            {[1, 6, 24, 168].map((hours) => (
              <Button
                key={hours}
                onClick={() => selectPreset(hours)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Clock data-icon="inline-start" />
                {hours === 1 ? "1h" : hours === 168 ? "7d" : `${hours}h`}
              </Button>
            ))}
          </div>
          <Calendar
            captionLayout="dropdown"
            mode="range"
            numberOfMonths={2}
            onSelect={(selected) => commitDates(selected?.from, selected?.to ?? selected?.from)}
            selected={
              fromDate
                ? {
                    from: fromDate,
                    ...(toDate ? { to: toDate } : {}),
                  }
                : undefined
            }
          />
          <Separator />
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dashboard-range-from-date">Start date</FieldLabel>
              <Input
                id="dashboard-range-from-date"
                onChange={(event) =>
                  commitDates(withDatePart(fromDate, event.target.value), toDate)
                }
                type="date"
                value={formatDateInput(fromDate)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dashboard-range-to-date">End date</FieldLabel>
              <Input
                id="dashboard-range-to-date"
                onChange={(event) =>
                  commitDates(fromDate, withDatePart(toDate, event.target.value))
                }
                type="date"
                value={formatDateInput(toDate)}
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dashboard-range-from-time">{t("dashboards.from")}</FieldLabel>
              <Input
                id="dashboard-range-from-time"
                onChange={(event) => {
                  const nextTime = event.target.value;
                  setFromTime(nextTime);
                  commitDates(fromDate, toDate, { fromTime: nextTime });
                }}
                type="time"
                value={fromTime}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dashboard-range-to-time">{t("dashboards.to")}</FieldLabel>
              <Input
                id="dashboard-range-to-time"
                onChange={(event) => {
                  const nextTime = event.target.value;
                  setToTime(nextTime);
                  commitDates(fromDate, toDate, { toTime: nextTime });
                }}
                type="time"
                value={toTime}
              />
            </Field>
          </FieldGroup>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DashboardCanvas({
  isEditing,
  onAddWidget,
  onDuplicateWidget,
  onEditWidget,
  onMoveWidget,
  onRemoveWidget,
  onResizeWidget,
  range,
  selectedWidgetId,
  telemetryClient,
  widgets,
}: {
  isEditing: boolean;
  onAddWidget: (kind: DashboardWidgetKind) => void;
  onDuplicateWidget: (widgetId: string) => void;
  onEditWidget: (widgetId: string) => void;
  onMoveWidget: (widgetId: string, deltaX: number, deltaY: number) => void;
  onRemoveWidget: (widgetId: string) => void;
  onResizeWidget: (widgetId: string, deltaWidth: number, deltaHeight: number) => void;
  range: { from: string; to: string };
  selectedWidgetId: string | null;
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  widgets: Array<DashboardWidget | SaveDashboardInput["widgets"][number]>;
}) {
  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AddWidgetButton onAddWidget={onAddWidget} />
      </div>
      {widgets.length === 0 ? (
        <EmptyDashboardCanvas
          actionLabel={t("dashboards.widget.addMetric")}
          description={t("dashboards.empty.noWidgets.description")}
          onCreate={() => onAddWidget("metric_timeseries")}
          title={t("dashboards.empty.noWidgets.title")}
        />
      ) : (
        <div
          className="grid auto-rows-[72px] grid-cols-12 gap-3 overflow-auto"
          data-dashboard-canvas
        >
          {widgets.map((widget) => (
            <DashboardWidgetFrame
              isEditing={isEditing}
              isSelected={selectedWidgetId === widget.id}
              key={widget.id}
              onDuplicate={() => onDuplicateWidget(widget.id)}
              onEdit={() => onEditWidget(widget.id)}
              onMove={(deltaX, deltaY) => onMoveWidget(widget.id, deltaX, deltaY)}
              onRemove={() => onRemoveWidget(widget.id)}
              onResize={(deltaWidth, deltaHeight) =>
                onResizeWidget(widget.id, deltaWidth, deltaHeight)
              }
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
  isEditing,
  isSelected,
  onDuplicate,
  onEdit,
  onMove,
  onRemove,
  onResize,
  range,
  telemetryClient,
  widget,
}: {
  isEditing: boolean;
  isSelected: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onMove: (deltaX: number, deltaY: number) => void;
  onRemove: () => void;
  onResize: (deltaWidth: number, deltaHeight: number) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  widget: DashboardWidget | SaveDashboardInput["widgets"][number];
}) {
  const { client, viewer } = useAppSession();
  const projectId = viewer?.selectedProject?.id ?? null;
  const layout = widget.layout;
  const metric = widget.metric;
  const richMetric = widget.richMetric;
  const logs = widget.logs;
  const traces = widget.traces;
  const liveTraces = widget.liveTraces;
  const alert = widget.alert;
  const pointerDrag = (event: PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (!isEditing) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const target = event.currentTarget;
    const cell = getDashboardPointerCell(target);
    let committedDeltaX = 0;
    let committedDeltaY = 0;
    target.setPointerCapture(event.pointerId);
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextDeltaX = Math.trunc((moveEvent.clientX - startX) / cell.width);
      const nextDeltaY = Math.trunc((moveEvent.clientY - startY) / cell.height);
      const deltaX = nextDeltaX - committedDeltaX;
      const deltaY = nextDeltaY - committedDeltaY;
      if (deltaX === 0 && deltaY === 0) {
        return;
      }
      if (mode === "move") {
        onMove(deltaX, deltaY);
      } else {
        onResize(deltaX, deltaY);
      }
      committedDeltaX = nextDeltaX;
      committedDeltaY = nextDeltaY;
    };
    const stopPointerDrag = () => {
      target.removeEventListener("pointermove", handlePointerMove);
      target.removeEventListener("pointerup", stopPointerDrag);
      target.removeEventListener("pointercancel", stopPointerDrag);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    };
    target.addEventListener("pointermove", handlePointerMove);
    target.addEventListener("pointerup", stopPointerDrag, { once: true });
    target.addEventListener("pointercancel", stopPointerDrag, { once: true });
  };
  const handleKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!isEditing) {
      return;
    }
    const resize = event.shiftKey;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = directions[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    if (resize) {
      onResize(delta[0], delta[1]);
    } else {
      onMove(delta[0], delta[1]);
    }
  };
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
  const richMetricInput: RichMetricSeriesInput | null = richMetric
    ? {
        from: range.from,
        to: range.to,
        query: richMetric.query,
      }
    : null;
  const alertSummaryInput: AlertSummaryInput | null =
    alert && widget.kind === "alert_status"
      ? {
          ruleIds: alert.ruleIds ?? [],
          states: alert.states ?? [],
          severities: alert.severities ?? [],
          signals: alert.signals ?? [],
          timeWindow: alert.timeWindow ?? "PT1H",
          limit: alert.limit ?? 20,
        }
      : null;
  const alertHistoryRuleId = alert?.ruleIds?.[0] ?? null;
  const alertHistoryLimit = alert?.limit ?? (widget.kind === "alert_evidence" ? 1 : 20);
  const metricQuery = useQuery({
    enabled: Boolean(metricInput),
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
  const richMetricQuery = useQuery({
    enabled: Boolean(richMetricInput),
    queryKey: richMetricInput
      ? queryKeys.richMetricSeries(richMetricInput)
      : ["RichMetricSeries", "dashboard-idle"],
    queryFn: () => telemetryClient.getRichMetricSeries(richMetricInput as RichMetricSeriesInput),
  });
  const alertSummaryQuery = useQuery({
    enabled: Boolean(projectId && alertSummaryInput),
    queryKey:
      projectId && alertSummaryInput
        ? queryKeys.alertSummary(projectId, alertSummaryInput)
        : ["AlertSummary", "dashboard-idle"],
    queryFn: () =>
      client.getAlertSummary(projectId as string, alertSummaryInput as AlertSummaryInput),
  });
  const alertHistoryQuery = useQuery({
    enabled: Boolean(projectId && alert && widget.kind !== "alert_status"),
    queryKey: projectId
      ? queryKeys.alertHistory(projectId, alertHistoryRuleId, alertHistoryLimit)
      : ["AlertHistory", "dashboard-idle"],
    queryFn: () =>
      client.getAlertHistory({
        projectId: projectId as string,
        ruleId: alertHistoryRuleId,
        first: alertHistoryLimit,
      }),
  });

  return (
    <section
      className="group relative col-span-12 flex min-h-56 flex-col overflow-hidden border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring data-[dashboard-widget-selected=true]:ring-2 data-[dashboard-widget-selected=true]:ring-ring lg:col-span-6"
      data-dashboard-widget-selected={isSelected}
      style={{
        gridColumn: `${Math.max(1, layout.x + 1)} / span ${Math.min(12, Math.max(layout.minW ?? 3, layout.w))}`,
        gridRow: `span ${Math.max(layout.minH ?? 2, layout.h)}`,
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isEditing ? (
            <Button
              aria-label="Move widget"
              onKeyDown={handleKeyboard}
              onPointerDown={(event) => pointerDrag(event, "move")}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <GripVertical />
            </Button>
          ) : null}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{widget.title}</h3>
            <p className="text-xs text-muted-foreground">{widget.kind}</p>
          </div>
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
          {isEditing ? (
            <>
              <Button
                aria-label={t("dashboards.duplicate")}
                onClick={onDuplicate}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <CopyPlus />
              </Button>
              <Button
                aria-label={t("dashboards.delete")}
                onClick={onRemove}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </>
          ) : null}
          <WidgetActionMenu
            isEditing={isEditing}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {metric ? (
          <QueryWidgetState
            error={metricQuery.error}
            isError={metricQuery.isError}
            isLoading={metricQuery.isLoading}
            onRetry={() => void metricQuery.refetch()}
          >
            {metricQuery.isSuccess ? (
              <MetricWidgetPreview result={metricQuery.data} visualization={metric.visualization} />
            ) : null}
          </QueryWidgetState>
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
        {richMetric ? (
          <QueryWidgetState
            error={richMetricQuery.error}
            isError={richMetricQuery.isError}
            isLoading={richMetricQuery.isLoading}
            onRetry={() => void richMetricQuery.refetch()}
          >
            {richMetricQuery.isSuccess ? (
              <RichMetricWidgetPreview
                result={richMetricQuery.data}
                visualization={richMetric.visualization}
              />
            ) : null}
          </QueryWidgetState>
        ) : null}
        {alert && widget.kind === "alert_status" ? (
          <QueryWidgetState
            error={alertSummaryQuery.error}
            isError={alertSummaryQuery.isError}
            isLoading={alertSummaryQuery.isLoading}
            onRetry={() => void alertSummaryQuery.refetch()}
          >
            {alertSummaryQuery.isSuccess ? (
              <AlertStatusWidgetPreview summary={alertSummaryQuery.data} />
            ) : null}
          </QueryWidgetState>
        ) : null}
        {alert && widget.kind === "alert_history" ? (
          <QueryWidgetState
            error={alertHistoryQuery.error}
            isError={alertHistoryQuery.isError}
            isLoading={alertHistoryQuery.isLoading}
            onRetry={() => void alertHistoryQuery.refetch()}
          >
            {alertHistoryQuery.isSuccess ? (
              <AlertHistoryWidgetPreview events={alertHistoryQuery.data.items} />
            ) : null}
          </QueryWidgetState>
        ) : null}
        {alert && widget.kind === "alert_evidence" ? (
          <QueryWidgetState
            error={alertHistoryQuery.error}
            isError={alertHistoryQuery.isError}
            isLoading={alertHistoryQuery.isLoading}
            onRetry={() => void alertHistoryQuery.refetch()}
          >
            {alertHistoryQuery.isSuccess ? (
              <AlertEvidenceWidgetPreview event={alertHistoryQuery.data.items[0] ?? null} />
            ) : null}
          </QueryWidgetState>
        ) : null}
        {!metric && !richMetric && !logs && !traces && !liveTraceInput && !alert ? (
          <WidgetSummary widget={widget} />
        ) : null}
      </div>
      {isEditing ? (
        <Button
          aria-label="Resize widget"
          className="absolute right-1 bottom-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          data-resize-handle="corner"
          onKeyDown={handleKeyboard}
          onPointerDown={(event) => pointerDrag(event, "resize")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Maximize2 />
        </Button>
      ) : null}
    </section>
  );
}

function WidgetActionMenu({
  isEditing,
  onDuplicate,
  onEdit,
  onRemove,
}: {
  isEditing: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("dashboards.widget.more")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit3 data-icon="inline-start" />
            {t("dashboards.widget.edit")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {isEditing ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onDuplicate}>
                <CopyPlus data-icon="inline-start" />
                {t("dashboards.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRemove} variant="destructive">
                <Trash2 data-icon="inline-start" />
                {t("dashboards.delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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

function getDashboardPointerCell(target: HTMLElement) {
  const canvas = target.closest<HTMLElement>("[data-dashboard-canvas]");
  if (!canvas) {
    return { width: 96, height: DASHBOARD_GRID_ROW_HEIGHT };
  }
  const bounds = canvas.getBoundingClientRect();
  const style = window.getComputedStyle(canvas);
  const columnGap = Number.parseFloat(style.columnGap) || 0;
  const rowGap = Number.parseFloat(style.rowGap) || 0;
  return {
    width:
      (bounds.width - columnGap * (DASHBOARD_GRID_COLUMNS - 1)) / DASHBOARD_GRID_COLUMNS +
      columnGap,
    height: DASHBOARD_GRID_ROW_HEIGHT + rowGap,
  };
}

function AlertStatusWidgetPreview({ summary }: { summary: AlertSummary }) {
  return (
    <div className="grid gap-3">
      <div>
        <div className="text-2xl font-semibold">{summary.totalCount}</div>
        <div className="text-xs text-muted-foreground">matching alert events</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <AlertCountGroup
          label="State"
          rows={summary.byState.map((row) => [row.state, row.count])}
        />
        <AlertCountGroup
          label="Severity"
          rows={summary.bySeverity.map((row) => [row.severity, row.count])}
        />
        <AlertCountGroup
          label="Signal"
          rows={summary.bySignal.map((row) => [row.signal, row.count])}
        />
      </div>
    </div>
  );
}

function AlertCountGroup({ label, rows }: { label: string; rows: Array<[string, number]> }) {
  return (
    <div className="grid content-start gap-1 border p-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {rows.length > 0 ? (
        rows.map(([name, count]) => (
          <div className="flex items-center justify-between gap-2 text-sm" key={name}>
            <span className="truncate">{name}</span>
            <span className="font-mono">{count}</span>
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">{t("dashboards.empty.noData")}</div>
      )}
    </div>
  );
}

function AlertHistoryWidgetPreview({ events }: { events: AlertEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboards.empty.noData")}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Created</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Summary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="whitespace-nowrap font-mono text-xs">
              {formatDateTime(event.createdAt)}
            </TableCell>
            <TableCell>
              <Badge variant={event.state === "FIRING" ? "destructive" : "secondary"}>
                {event.state}
              </Badge>
            </TableCell>
            <TableCell>{event.severity}</TableCell>
            <TableCell className="max-w-[18rem] truncate">{event.summary}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AlertEvidenceWidgetPreview({ event }: { event: AlertEvent | null }) {
  if (!event) {
    return <p className="text-sm text-muted-foreground">{t("dashboards.empty.noData")}</p>;
  }
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={event.state === "FIRING" ? "destructive" : "secondary"}>
          {event.state}
        </Badge>
        <Badge variant="outline">{event.severity}</Badge>
      </div>
      <p>{event.summary}</p>
      <dl className="grid gap-2">
        <SummaryRow label="Rule">
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={`/alerts?ruleId=${event.ruleId}`}
          >
            {event.ruleId}
          </a>
        </SummaryRow>
        {event.evidenceTraceId ? (
          <SummaryRow label="Trace">
            <a
              className="text-primary underline-offset-4 hover:underline"
              href={`/traces/${event.evidenceTraceId}`}
            >
              {event.evidenceTraceId}
            </a>
          </SummaryRow>
        ) : null}
        {event.evidenceLogId ? <SummaryRow label="Log">{event.evidenceLogId}</SummaryRow> : null}
        {event.evidenceMetricName ? (
          <SummaryRow label="Metric">{event.evidenceMetricName}</SummaryRow>
        ) : null}
      </dl>
    </div>
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

function RichMetricWidgetPreview({
  result,
  visualization,
}: {
  result: Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["getRichMetricSeries"]>>;
  visualization: MetricChartType;
}) {
  const visibleIds = new Set(
    result.displaySeries.filter((series) => series.visible).map((series) => series.sourceId),
  );
  const visibleSeries = visibleIds.size
    ? result.series.filter((series) => visibleIds.has(series.id) || visibleIds.has(series.sourceId))
    : result.series;

  if (visibleSeries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboards.metric.noSeries")}</p>;
  }

  if (visualization === "stat" || visualization === "radial") {
    const latest = visibleSeries
      .flatMap((series) => series.points.map((point) => ({ ...point, label: series.label })))
      .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp))
      .at(-1);
    return (
      <div className="flex h-full min-h-40 flex-col justify-center gap-2">
        <span className="text-sm text-muted-foreground">{latest?.label ?? t("value.none")}</span>
        <span className="text-3xl font-semibold tabular-nums">
          {latest ? latest.value.toLocaleString() : t("value.none")}
        </span>
        <span className="text-xs text-muted-foreground">
          {latest?.timestamp ?? result.interval}
        </span>
      </div>
    );
  }

  if (visualization === "table") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display series</TableHead>
            <TableHead>{t("metrics.series.timestamp")}</TableHead>
            <TableHead>{t("metrics.series.value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleSeries.slice(0, 12).map((series) => {
            const point = series.points.at(-1);
            return (
              <TableRow key={series.id}>
                <TableCell className="max-w-48 truncate text-xs">{series.label}</TableCell>
                <TableCell>{point?.timestamp ?? t("value.none")}</TableCell>
                <TableCell className="font-mono">{point?.value ?? t("value.none")}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const chart = buildRichMetricChartData(visibleSeries, visualization);
  return (
    <TelemetryChart
      chartClassName="h-60 min-h-60"
      data={chart.data}
      emptyMessage={t("dashboards.metric.noSeries")}
      kind={chart.kind}
      series={chart.series}
      summary={`Rich metric ${visualization} chart with ${visibleSeries.length} ${t(
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
  if (typeof labels === "object" && !Array.isArray(labels)) {
    const entries = Object.entries(labels);
    if (entries.length === 1) {
      return String(entries[0]?.[1] ?? t("value.none"));
    }
    return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
  }
  return jsonPreview(labels);
}

function buildMetricChartData(result: MetricSeriesResultData, visualization: MetricChartType) {
  if (visualization === "pie" || visualization === "donut" || visualization === "radar") {
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
    kind: normalizeChartKind(visualization),
    data,
    series,
  };
}

function buildRichMetricChartData(
  richSeries: Awaited<
    ReturnType<ReturnType<typeof useTelemetryClient>["getRichMetricSeries"]>
  >["series"],
  visualization: MetricChartType,
) {
  if (visualization === "pie" || visualization === "donut" || visualization === "radar") {
    return {
      kind: "pie" as TelemetryChartKind,
      data: richSeries.slice(0, 12).map((series) => ({
        label: series.label,
        value: series.points.at(-1)?.value ?? 0,
      })),
      series: [{ key: "value", label: t("metrics.series.value") }],
    };
  }
  const timestamps = Array.from(
    new Set(richSeries.flatMap((series) => series.points.map((point) => point.timestamp))),
  ).sort();
  const series = richSeries.slice(0, 20).map((metricSeries) => ({
    key: metricSeries.id,
    label: metricSeries.label,
  }));
  const data = timestamps.map((timestamp) => {
    const row: Record<string, number | string | null> = { label: timestamp };
    richSeries.slice(0, 20).forEach((metricSeries) => {
      row[metricSeries.id] =
        metricSeries.points.find((point) => point.timestamp === timestamp)?.value ?? null;
    });
    return row as { label: string } & Record<string, number | string | null>;
  });
  return { kind: normalizeChartKind(visualization), data, series };
}

function normalizeChartKind(visualization: MetricChartType): TelemetryChartKind {
  if (visualization === "area") {
    return "area";
  }
  if (visualization === "bar" || visualization === "heatmap" || visualization === "histogram") {
    return "bar";
  }
  if (visualization === "pie" || visualization === "donut" || visualization === "radar") {
    return "pie";
  }
  return "line";
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
  range,
  telemetryClient,
  widget,
}: {
  dashboard: Dashboard | null;
  draft: SaveDashboardInput | null;
  onDraftChange: (draft: SaveDashboardInput | null) => void;
  onOpenChange: (open: boolean) => void;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  open: boolean;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
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
              range={range}
              telemetryClient={telemetryClient}
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
  const [open, setOpen] = useState(false);
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
    ...(isRichMetricEditingEnabled()
      ? ([
          ["metric_rich", <LineChart data-icon="inline-start" key="metric_rich" />, "Rich metric"],
        ] satisfies Array<[DashboardWidgetKind, ReactNode, string]>)
      : []),
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
    [
      "alert_status",
      <Bell data-icon="inline-start" key="alert_status" />,
      t("dashboards.widget.alertStatus"),
    ],
    [
      "alert_history",
      <History data-icon="inline-start" key="alert_history" />,
      t("dashboards.widget.alertHistory"),
    ],
    [
      "alert_evidence",
      <FileSearch data-icon="inline-start" key="alert_evidence" />,
      t("dashboards.widget.alertEvidence"),
    ],
  ];
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button type="button">
          <Plus data-icon="inline-start" />
          {t("dashboards.widget.add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" collisionPadding={16}>
        <Command>
          <CommandList>
            <CommandGroup>
              {actions.map(([kind, icon, label]) => (
                <CommandItem
                  key={kind}
                  onSelect={() => {
                    onAddWidget(kind);
                    setOpen(false);
                  }}
                  value={label}
                >
                  {icon}
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WidgetEditorGroups({
  disabled,
  onWidgetChange,
  range,
  telemetryClient,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
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
              <MetricNameCombobox
                disabled={disabled}
                id={`${widget.id}-metric-name`}
                onChange={(value) =>
                  updateMetricWidget(widget, { metricName: value }, onWidgetChange)
                }
                range={range}
                telemetryClient={telemetryClient}
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
                    {metricAggregations.map((aggregation) => (
                      <SelectItem key={aggregation} value={aggregation}>
                        {aggregation}
                      </SelectItem>
                    ))}
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
        ) : widget.richMetric ? (
          !isRichMetricEditingEnabled() ? (
            <RichMetricUnsupportedState />
          ) : (
            <RichMetricWidgetEditor
              disabled={disabled}
              onWidgetChange={onWidgetChange}
              range={range}
              telemetryClient={telemetryClient}
              widget={widget}
            />
          )
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
        ) : widget.alert ? (
          <AlertWidgetEditor disabled={disabled} onWidgetChange={onWidgetChange} widget={widget} />
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
          {widget.metric || widget.richMetric ? (
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${widget.id}-visualization`}>
                {t("dashboards.editor.chartType")}
              </FieldLabel>
              <Select
                disabled={disabled}
                onValueChange={(value) => {
                  if (widget.metric) {
                    updateMetricWidget(
                      widget,
                      {
                        visualization: value as NonNullable<typeof widget.metric>["visualization"],
                      },
                      onWidgetChange,
                    );
                    return;
                  }
                  updateRichMetricWidget(
                    widget,
                    {
                      visualization: value as NonNullable<
                        typeof widget.richMetric
                      >["visualization"],
                    },
                    onWidgetChange,
                  );
                }}
                value={widget.metric?.visualization ?? widget.richMetric?.visualization ?? "line"}
              >
                <SelectTrigger id={`${widget.id}-visualization`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {metricChartTypes.map((chartType) => (
                      <SelectItem key={chartType} value={chartType}>
                        {chartType}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : widget.alert ? (
            <SummaryRow label={t("dashboards.editor.mode")}>{widget.kind}</SummaryRow>
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
        {widget.metric || widget.richMetric ? (
          <WidgetSummary widget={widget} />
        ) : widget.alert ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboards.editor.thresholdsUnavailable")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("dashboards.editor.thresholdsUnavailable")}
          </p>
        )}
      </EditorGroup>
    </div>
  );
}

function RichMetricUnsupportedState() {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      Rich metric widgets can render saved data, but creation and editing stay disabled until the
      complete rich metric implementation gate passes.
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

function updateRichMetricWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["richMetric"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.richMetric) {
    return;
  }
  onWidgetChange({
    ...widget,
    richMetric: {
      ...widget.richMetric,
      ...patch,
    },
  });
}

function MetricNameCombobox({
  disabled,
  id,
  onChange,
  range,
  telemetryClient,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const namesInput: MetricNameSearchInput = {
    query: query || null,
    from: range.from,
    to: range.to,
    limit: 20,
  };
  const namesQuery = useQuery({
    enabled: open && !disabled,
    queryKey: queryKeys.metricNames(namesInput),
    queryFn: () => telemetryClient.getMetricNames(namesInput),
  });
  const descriptors = namesQuery.data?.items ?? [];
  const hasTypedValue =
    query.trim().length > 0 && descriptors.every((descriptor) => descriptor.name !== query.trim());

  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate font-mono text-xs">
            {value || t("dashboards.metric.select")}
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={setQuery}
            placeholder={t("dashboards.metric.search")}
            value={query}
          />
          <CommandList>
            <CommandEmpty>
              {namesQuery.isLoading ? t("state.loading") : t("dashboards.metric.noMatches")}
            </CommandEmpty>
            <CommandGroup>
              {descriptors.map((descriptor) => (
                <CommandItem
                  key={descriptor.name}
                  onSelect={() => {
                    onChange(descriptor.name);
                    setOpen(false);
                  }}
                  value={descriptor.name}
                >
                  <Check
                    className={descriptor.name === value ? "opacity-100" : "opacity-0"}
                    data-icon="inline-start"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{descriptor.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{descriptor.kind}</span>
                      {descriptor.unit ? <span>{descriptor.unit}</span> : null}
                      <span>{formatDateTime(descriptor.lastSeenAt)}</span>
                    </span>
                  </span>
                </CommandItem>
              ))}
              {hasTypedValue ? (
                <CommandItem
                  onSelect={() => {
                    onChange(query.trim());
                    setOpen(false);
                  }}
                  value={query.trim()}
                >
                  <Plus data-icon="inline-start" />
                  <span className="truncate font-mono text-xs">{query.trim()}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RichMetricWidgetEditor({
  disabled,
  onWidgetChange,
  range,
  telemetryClient,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  widget: DashboardWidgetInput;
}) {
  if (!widget.richMetric) {
    return null;
  }
  const query = widget.richMetric.query;
  const updateQuery = (patch: Partial<DashboardMetricQueryInput>) =>
    updateRichMetricWidget(widget, { query: { ...query, ...patch } }, onWidgetChange);
  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-rich-interval`}>
          {t("dashboards.editor.interval")}
        </FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-rich-interval`}
          onChange={(event) => updateQuery({ interval: stringOrNull(event.target.value) })}
          value={query.interval ?? ""}
        />
      </Field>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Queries</h3>
          <Button
            disabled={disabled}
            onClick={() => updateQuery(addRichMetricQueryRow(query))}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add query
          </Button>
        </div>
        {(query.queries ?? []).map((row, index) => (
          <RichMetricQueryRowEditor
            disabled={disabled}
            key={row.id}
            onChange={(nextRow) =>
              updateQuery({
                queries: query.queries.map((candidate) =>
                  candidate.id === row.id ? nextRow : candidate,
                ),
              })
            }
            onRemove={() =>
              updateQuery({
                queries: (query.queries ?? []).filter((candidate) => candidate.id !== row.id),
                displaySeries: (query.displaySeries ?? []).filter(
                  (series) => series.sourceId !== row.id,
                ),
              })
            }
            range={range}
            row={row}
            rowNumber={index + 1}
            telemetryClient={telemetryClient}
          />
        ))}
      </div>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Formulas</h3>
          <Button
            disabled={disabled}
            onClick={() =>
              updateQuery({ formulas: addRichMetricFormula(query.formulas ?? [], query.queries) })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add formula
          </Button>
        </div>
        {(query.formulas ?? []).map((formula) => (
          <div className="grid gap-2 border p-2" key={formula.id}>
            <TextWidgetField
              disabled={disabled}
              id={`${widget.id}-${formula.id}-label`}
              label="Label"
              onChange={(value) =>
                updateQuery({
                  formulas: (query.formulas ?? []).map((candidate) =>
                    candidate.id === formula.id
                      ? { ...candidate, label: value ?? candidate.label }
                      : candidate,
                  ),
                })
              }
              placeholder="Label"
              value={formula.label}
            />
            <SummaryRow label="Formula">{describeFormulaExpression(formula.expression)}</SummaryRow>
          </div>
        ))}
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Display series</h3>
        {(query.displaySeries ?? []).map((series) => (
          <div className="flex items-center gap-2 text-sm" key={series.id}>
            <Checkbox
              aria-label={series.label}
              checked={series.visible ?? true}
              disabled={disabled}
              onCheckedChange={(checked) =>
                updateQuery({
                  displaySeries: (query.displaySeries ?? []).map((candidate) =>
                    candidate.id === series.id
                      ? { ...candidate, visible: checked === true }
                      : candidate,
                  ),
                })
              }
            />
            <span>{series.label}</span>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}

function RichMetricQueryRowEditor({
  disabled,
  onChange,
  onRemove,
  range,
  row,
  rowNumber,
  telemetryClient,
}: {
  disabled: boolean;
  onChange: (row: DashboardMetricQueryRowInput) => void;
  onRemove: () => void;
  range: { from: string; to: string };
  row: DashboardMetricQueryRowInput;
  rowNumber: number;
  telemetryClient: ReturnType<typeof useTelemetryClient>;
}) {
  return (
    <div className="grid gap-2 border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">Query {rowNumber}</div>
        <Button
          aria-label={t("dashboards.editor.removeQuery")}
          disabled={disabled}
          onClick={onRemove}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
      <TextWidgetField
        disabled={disabled}
        id={`${row.id}-label`}
        label="Label"
        onChange={(value) => onChange({ ...row, label: value ?? row.label })}
        placeholder="Label"
        value={row.label}
      />
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-metric`}>{t("dashboards.editor.metricName")}</FieldLabel>
        <MetricNameCombobox
          disabled={disabled}
          id={`${row.id}-metric`}
          onChange={(value) => onChange({ ...row, metricName: value })}
          range={range}
          telemetryClient={telemetryClient}
          value={row.metricName}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-aggregation`}>
          {t("dashboards.editor.aggregation")}
        </FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) => onChange({ ...row, aggregation: value as MetricAggregation })}
          value={row.aggregation}
        >
          <SelectTrigger id={`${row.id}-aggregation`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {metricAggregations.map((aggregation) => (
                <SelectItem key={aggregation} value={aggregation}>
                  {aggregation}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <TextWidgetField
        disabled={disabled}
        id={`${row.id}-group-by`}
        label={t("dashboards.editor.groupBy")}
        onChange={(value) => onChange({ ...row, groupBy: csvToList(value) })}
        placeholder="service.name, http.route"
        value={(row.groupBy ?? []).join(", ")}
      />
      <NumberWidgetField
        disabled={disabled}
        id={`${row.id}-max-series`}
        label="Max series"
        onChange={(value) => onChange({ ...row, maxSeries: value })}
        value={row.maxSeries}
      />
    </div>
  );
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

function AlertWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.alert) {
    return null;
  }

  return (
    <FieldGroup>
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-alert-rule-ids`}
        label="Rule IDs"
        onChange={(value) =>
          updateAlertWidget(widget, { ruleIds: csvToList(value) }, onWidgetChange)
        }
        placeholder="rule-1, rule-2"
        value={(widget.alert.ruleIds ?? []).join(", ")}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-alert-states`}
        label="States"
        onChange={(value) =>
          updateAlertWidget(
            widget,
            { states: csvToList(value) as NonNullable<NonNullable<typeof widget.alert>["states"]> },
            onWidgetChange,
          )
        }
        placeholder="FIRING, RESOLVED"
        value={(widget.alert.states ?? []).join(", ")}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-alert-severities`}
        label="Severities"
        onChange={(value) =>
          updateAlertWidget(
            widget,
            {
              severities: csvToList(value) as NonNullable<
                NonNullable<typeof widget.alert>["severities"]
              >,
            },
            onWidgetChange,
          )
        }
        placeholder="ERROR, CRITICAL"
        value={(widget.alert.severities ?? []).join(", ")}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-alert-signals`}
        label="Signals"
        onChange={(value) =>
          updateAlertWidget(
            widget,
            {
              signals: csvToList(value) as NonNullable<NonNullable<typeof widget.alert>["signals"]>,
            },
            onWidgetChange,
          )
        }
        placeholder="METRIC, LOG, TRACE"
        value={(widget.alert.signals ?? []).join(", ")}
      />
      <TextWidgetField
        disabled={disabled}
        id={`${widget.id}-alert-window`}
        label="Time window"
        onChange={(value) => updateAlertWidget(widget, { timeWindow: value }, onWidgetChange)}
        placeholder="PT1H"
        value={widget.alert.timeWindow}
      />
      <NumberWidgetField
        disabled={disabled}
        id={`${widget.id}-alert-limit`}
        label="Limit"
        onChange={(value) => updateAlertWidget(widget, { limit: value }, onWidgetChange)}
        value={widget.alert.limit}
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

function updateAlertWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["alert"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.alert) {
    return;
  }
  onWidgetChange({
    ...widget,
    alert: {
      ...widget.alert,
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
      {widget.richMetric ? (
        <SummaryRow label="Rich metric">
          {widget.richMetric.query.queries.map((query) => query.label).join(", ")}
        </SummaryRow>
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
      {widget.alert ? (
        <SummaryRow label={t("alerts.title")}>
          {widget.alert.ruleIds?.join(", ") || widget.kind}
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

function EmptyDashboardCanvas({
  actionLabel,
  description,
  onCreate,
  title,
}: {
  actionLabel: string;
  description: string;
  onCreate: () => void;
  title: string;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      <Button onClick={onCreate} type="button">
        <Plus data-icon="inline-start" />
        {actionLabel}
      </Button>
    </div>
  );
}

function startDraftForSelectedDashboard(dashboard: Dashboard | null): DashboardDraftState {
  if (!dashboard) {
    return startDashboardDraft({ source: "new" });
  }
  if (dashboard.visibility === "builtin") {
    return startDashboardDraft({ dashboard, source: "duplicate" });
  }
  return startDashboardDraft({ dashboard, source: "edit_existing" });
}

function syncDraftStateFromSaveInput(
  state: DashboardDraftState,
  draft: SaveDashboardInput | null,
): DashboardDraftState | null {
  if (!draft) {
    return null;
  }
  return {
    ...state,
    dirty: {
      ...state.dirty,
      metadata:
        state.dirty.metadata ||
        state.metadata.name !== draft.name ||
        state.metadata.description !== (draft.description ?? null) ||
        state.metadata.visibility !== (draft.visibility ?? "personal"),
      widgetData: state.dirty.widgetData || state.widgets !== draft.widgets,
    },
    metadata: {
      defaultTimeWindow: draft.defaultTimeWindow ?? state.metadata.defaultTimeWindow,
      description: draft.description ?? null,
      name: draft.name,
      tags: draft.tags ?? [],
      visibility: draft.visibility ?? "personal",
    },
    widgets: draft.widgets,
  };
}

function createDashboardWidget(kind: DashboardWidgetKind, index: number): DashboardWidgetInput {
  const layout = defaultDashboardWidgetLayout(kind, index);
  const base = {
    id: `widget-${index}`,
    title: widgetTitle(kind),
    kind,
    layout,
  };

  return widgetFromBase(base, kind);
}

function widgetFromBase(
  base: {
    id: string;
    kind: DashboardWidgetKind;
    layout: DashboardWidgetInput["layout"];
    title: string;
  },
  kind: DashboardWidgetKind,
): DashboardWidgetInput {
  if (kind === "metric_timeseries" || kind === "metric_stat" || kind === "metric_table") {
    return {
      ...base,
      metric: {
        metricName: EMPTY_METRIC_NAME,
        aggregation: "sum",
        groupBy: [],
        filters: [],
        timeWindow: "PT1H",
        interval: "PT1M",
        visualization: kind === "metric_stat" ? "stat" : kind === "metric_table" ? "table" : "line",
        legend: kind === "metric_timeseries",
        maxSeries: 20,
        thresholds: [],
      },
    };
  }
  if (kind === "metric_rich") {
    return {
      ...base,
      richMetric: {
        query: defaultRichMetricQuery(),
        visualization: "line",
        legend: true,
        maxSeries: 20,
        thresholds: [],
      },
    };
  }
  if (kind === "log_table") {
    return {
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
    };
  }
  if (kind === "trace_table") {
    return {
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
    };
  }
  if (kind === "live_trace_table") {
    return {
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
    };
  }
  return {
    ...base,
    alert: {
      ruleIds: [],
      states: [],
      severities: [],
      signals: [],
      timeWindow: "PT1H",
      limit: kind === "alert_evidence" ? 1 : 20,
    },
  };
}

function widgetTitle(kind: DashboardWidgetKind) {
  switch (kind) {
    case "metric_stat":
      return t("dashboards.widget.metricStat");
    case "metric_table":
      return t("dashboards.widget.metricTable");
    case "metric_rich":
      return "Rich metric";
    case "log_table":
      return t("dashboards.widget.logTable");
    case "trace_table":
      return t("dashboards.widget.traceTable");
    case "live_trace_table":
      return t("dashboards.widget.liveTraceTable");
    case "alert_status":
      return t("dashboards.widget.alertStatus");
    case "alert_history":
      return t("dashboards.widget.alertHistory");
    case "alert_evidence":
      return t("dashboards.widget.alertEvidence");
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
    richMetric: widget.richMetric ? { ...widget.richMetric } : null,
    logs: widget.logs ? { ...widget.logs } : null,
    traces: widget.traces ? { ...widget.traces } : null,
    liveTraces: widget.liveTraces ? { ...widget.liveTraces } : null,
    alert: widget.alert ? { ...widget.alert } : null,
  };
}

function prepareDashboardSaveInput(draft: SaveDashboardInput): SaveDashboardInput {
  return {
    ...draft,
    widgets: sortDashboardWidgetsForSave(compactDashboardLayout(draft.widgets)),
  };
}

function duplicateWidgetInput(widgets: DashboardWidgetInput[], widgetId: string) {
  const source = widgets.find((widget) => widget.id === widgetId);
  if (!source) {
    return null;
  }
  return {
    ...toWidgetInput(source),
    id: `${source.id}-copy-${Date.now().toString(36)}`,
    title: `${source.title} ${t("dashboards.copySuffix")}`,
    layout: {
      ...source.layout,
      y: source.layout.y + source.layout.h,
    },
  };
}

function defaultRichMetricQuery(): DashboardMetricQueryInput {
  const query = defaultRichMetricQueryRow(1);
  return {
    timeWindow: "PT1H",
    interval: "PT1M",
    queries: [query],
    formulas: [],
    displaySeries: [
      { id: "display-query-a", label: query.label, sourceId: query.id, visible: true },
    ],
  };
}

function defaultRichMetricQueryRow(index: number): DashboardMetricQueryRowInput {
  const suffix = String.fromCharCode(96 + index);
  return {
    id: `query-${suffix}`,
    label: `Query ${suffix.toUpperCase()}`,
    metricName: EMPTY_METRIC_NAME,
    aggregation: "sum",
    groupBy: [],
    filters: [],
    maxSeries: 20,
  };
}

function addRichMetricQueryRow(
  query: DashboardMetricQueryInput,
): Partial<DashboardMetricQueryInput> {
  const row = defaultRichMetricQueryRow((query.queries ?? []).length + 1);
  return {
    queries: [...(query.queries ?? []), row],
    displaySeries: [
      ...(query.displaySeries ?? []),
      {
        id: `display-${row.id}`,
        label: row.label,
        sourceId: row.id,
        visible: true,
      },
    ],
  };
}

function addRichMetricFormula(
  formulas: DashboardMetricFormulaInput[],
  queries: DashboardMetricQueryRowInput[],
) {
  const left = queries[0]?.id ?? "query-a";
  const right = queries[1]?.id ?? left;
  const formula: DashboardMetricFormulaInput = {
    id: `formula-${formulas.length + 1}`,
    label: `Formula ${formulas.length + 1}`,
    expression: {
      kind: "function",
      function: "ratio",
      arguments: [
        { kind: "ref", refId: left },
        { kind: "ref", refId: right },
      ],
    },
  };
  return [...formulas, formula];
}

function describeFormulaExpression(expression: DashboardMetricFormulaInput["expression"]): string {
  if (expression.kind === "ref") {
    return expression.refId ?? t("value.none");
  }
  if (expression.kind === "number") {
    return String(expression.value ?? 0);
  }
  if (expression.kind === "function") {
    return `${expression.function ?? "function"}(${(expression.arguments ?? [])
      .map(describeFormulaExpression)
      .join(", ")})`;
  }
  if (expression.kind === "binary") {
    return `${describeFormulaExpression(expression.left ?? { kind: "number", value: 0 })} ${
      expression.operator ?? "add"
    } ${describeFormulaExpression(expression.right ?? { kind: "number", value: 0 })}`;
  }
  return expression.kind;
}

function csvToList(value: string | null) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
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

function defaultDashboardRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function metricNamesForDashboardWidgets(
  widgets: Array<DashboardWidget | SaveDashboardInput["widgets"][number]>,
) {
  return Array.from(
    new Set(
      widgets.flatMap((widget) => [
        widget.metric?.metricName,
        ...(widget.richMetric?.query.queries.map((query) => query.metricName) ?? []),
      ]),
    ),
  ).filter((metricName): metricName is string => Boolean(metricName));
}

function dashboardObservedMetricRange(descriptors: MetricDescriptor[]) {
  const timestamps = descriptors.flatMap((descriptor) => [
    Date.parse(descriptor.firstSeenAt),
    Date.parse(descriptor.lastSeenAt),
  ]);
  const validTimestamps = timestamps.filter(Number.isFinite);
  if (validTimestamps.length === 0) {
    return null;
  }
  const paddingMs = 10 * 60 * 1000;
  return {
    from: new Date(Math.min(...validTimestamps) - paddingMs).toISOString(),
    to: new Date(Math.max(...validTimestamps) + paddingMs).toISOString(),
  };
}

function parseDateValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatTimeInput(date: Date | undefined) {
  if (!date) {
    return "00:00";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDateInput(date: Date | undefined) {
  if (!date) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function withDatePart(date: Date | undefined, value: string) {
  if (!date || !value) {
    return date;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return date;
  }
  const next = new Date(date);
  next.setFullYear(year, month - 1, day);
  return next;
}

function withTime(date: Date, value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  const next = new Date(date);
  next.setHours(Number(hours), Number(minutes), 0, 0);
  return next;
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
