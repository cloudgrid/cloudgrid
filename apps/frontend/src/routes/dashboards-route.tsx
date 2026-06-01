import type {
  AlertSummaryInput,
  LogSearchInput,
  MetricDescriptor,
  MetricSeriesInput,
  RichMetricSeriesInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import { buildDashboardListInput } from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Clock,
  Copy,
  CopyPlus,
  Edit3,
  FileSearch,
  GripVertical,
  History,
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
} from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingRows } from "../components/query-state";
import { SearchInput } from "../components/search-input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Command, CommandGroup, CommandItem, CommandList } from "../components/ui/command";
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
import { Textarea } from "../components/ui/textarea";
import {
  type DashboardDraftState,
  dashboardDraftReducer,
  startDashboardDraft,
  toDashboardSaveInput,
} from "../features/dashboards/dashboard-draft-reducer";
import {
  compactDashboardLayout,
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_GRID_ROW_HEIGHT,
  defaultDashboardWidgetLayout,
  sortDashboardWidgetsForSave,
} from "../features/dashboards/dashboard-layout";
import {
  defaultRichMetricQuery,
  isRichMetricEditingEnabled,
} from "../features/dashboards/widget-editor/rich-metric-widget-editor";
import { WidgetEditorGroups } from "../features/dashboards/widget-editor/widget-editor-groups";
import {
  AlertEvidenceWidgetPreview,
  AlertHistoryWidgetPreview,
  AlertStatusWidgetPreview,
} from "../features/dashboards/widget-renderers/alert-widget-renderers";
import { LiveTraceWidgetPreview } from "../features/dashboards/widget-renderers/live-trace-widget-renderer";
import { LogWidgetPreview } from "../features/dashboards/widget-renderers/log-widget-renderer";
import { MetricWidgetPreview } from "../features/dashboards/widget-renderers/metric-widget-renderer";
import { RichMetricWidgetPreview } from "../features/dashboards/widget-renderers/rich-metric-widget-renderer";
import { TraceWidgetPreview } from "../features/dashboards/widget-renderers/trace-widget-renderer";
import {
  mapAlertSummaryInput,
  mapLiveTraceInput,
  mapLogSearchInput,
  mapMetricSeriesInput,
  mapRichMetricSeriesInput,
  mapTraceSearchInput,
} from "../features/dashboards/widget-source-mappers";
import type {
  Dashboard,
  DashboardVisibility,
  DashboardWidget,
  DashboardWidgetInput,
  DashboardWidgetKind,
  SaveDashboardInput,
} from "../lib/dashboard-contracts";
import { notifyMutationError, notifyMutationSuccess } from "../lib/feedback";
import { formatDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

const EMPTY_METRIC_NAME = "gen_ai.client.token.usage";

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
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
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
  const enterEditMode = () => {
    if (!selectedDashboard) {
      return;
    }
    setDraftState(startDraftForSelectedDashboard(selectedDashboard));
  };
  const discardChanges = () => {
    setDraftState(null);
    setInspectorWidgetId(null);
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {selectedDashboard ? (
            <Button
              aria-label={selectedDashboard.pinned ? t("dashboards.unpin") : t("dashboards.pin")}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() =>
                void pinMutation.mutate({
                  dashboardId: selectedDashboard.id,
                  pinned: !selectedDashboard.pinned,
                })
              }
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {selectedDashboard.pinned ? (
                <StarOff className="size-4" />
              ) : (
                <Star className="size-4" />
              )}
            </Button>
          ) : null}
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
          {draft ? (
            <>
              <Badge data-dashboard-dirty="true" variant="secondary">
                {t("dashboards.unsavedChanges")}
              </Badge>
              <Button onClick={discardChanges} type="button" variant="outline">
                <X data-icon="inline-start" />
                {t("dashboards.discardChanges")}
              </Button>
              <Button
                disabled={saveMutation.isPending}
                onClick={() => void saveMutation.mutate(prepareDashboardSaveInput(draft))}
              >
                <Save data-icon="inline-start" />
                {t("dashboards.save")}
              </Button>
            </>
          ) : null}
          {selectedDashboard ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("dashboards.actions")}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!draft ? (
                  <DropdownMenuItem onSelect={enterEditMode}>
                    <Edit3 data-icon="inline-start" />
                    {t("dashboards.editDashboard")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setSettingsSheetOpen(true)}>
                  <MoreHorizontal data-icon="inline-start" />
                  {t("dashboards.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={duplicateDashboard}>
                  <Copy data-icon="inline-start" />
                  {t("dashboards.duplicate")}
                </DropdownMenuItem>
                {selectedDashboard.visibility !== "builtin" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setDeleteDialogOpen(true)}
                      variant="destructive"
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("dashboards.delete")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
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
          </div>

          <WidgetEditorSheet
            dashboard={selectedDashboard}
            draft={draft}
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
          <DashboardSettingsSheet
            draft={draft}
            onDraftChange={(nextDraft) =>
              setDraftState((current) =>
                current ? syncDraftStateFromSaveInput(current, nextDraft) : current,
              )
            }
            onOpenChange={setSettingsSheetOpen}
            open={settingsSheetOpen}
            selectedDashboard={selectedDashboard}
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
  const groups: Array<[string, DashboardVisibility]> = [
    [t("dashboards.rail.builtin"), "builtin"],
    [t("dashboards.rail.personal"), "personal"],
    [t("dashboards.rail.project"), "project"],
  ];

  return (
    <section className="min-h-0 flex-1 overflow-auto">
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
          const groupDashboards = dashboards.filter(
            (dashboard) => dashboard.visibility === visibility,
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
    </section>
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
              <FieldLabel htmlFor="dashboard-range-from-date">
                {t("dashboards.startDate")}
              </FieldLabel>
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
              <FieldLabel htmlFor="dashboard-range-to-date">{t("dashboards.endDate")}</FieldLabel>
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
      {isEditing ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AddWidgetButton onAddWidget={onAddWidget} />
        </div>
      ) : null}
      {widgets.length === 0 ? (
        <EmptyDashboardCanvas
          actionLabel={isEditing ? t("dashboards.widget.addMetric") : undefined}
          description={t("dashboards.empty.noWidgets.description")}
          onCreate={isEditing ? () => onAddWidget("metric_timeseries") : undefined}
          title={t("dashboards.empty.noWidgets.title")}
        />
      ) : (
        <div className="grid auto-rows-[72px] grid-cols-12 gap-3" data-dashboard-canvas>
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
  const _liveTraces = widget.liveTraces;
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
  const widgetInput = toWidgetInput(widget);
  const metricInput = mapMetricSeriesInput(widgetInput, range);
  const logInput = mapLogSearchInput(widgetInput, range);
  const traceInput = mapTraceSearchInput(widgetInput, range);
  const liveTraceInput = mapLiveTraceInput(widgetInput, range);
  const richMetricInput = mapRichMetricSeriesInput(widgetInput, range);
  const alertSummaryInput = mapAlertSummaryInput(widgetInput);
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
              aria-label={t("dashboards.widget.move")}
              className="cursor-grab active:cursor-grabbing"
              onKeyDown={handleKeyboard}
              onPointerDown={(event) => pointerDrag(event, "move")}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <GripVertical />
            </Button>
          ) : null}
          <h3 className="min-w-0 truncate text-sm font-semibold">{widget.title}</h3>
        </div>
        <WidgetActionMenu
          isEditing={isEditing}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onRemove={onRemove}
        />
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
          <p className="text-sm text-muted-foreground">{t("dashboards.widget.noDataSource")}</p>
        ) : null}
      </div>
      {isEditing ? (
        <Button
          aria-label={t("dashboards.widget.resize")}
          className="absolute right-1 bottom-1 cursor-se-resize opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
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

function DashboardSettingsSheet({
  draft,
  onDraftChange,
  onOpenChange,
  open,
  selectedDashboard,
}: {
  draft: SaveDashboardInput | null;
  onDraftChange: (draft: SaveDashboardInput | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedDashboard: Dashboard | null;
}) {
  const isEditing = Boolean(draft);
  const name = draft?.name ?? selectedDashboard?.name ?? "";
  const visibility = draft?.visibility ?? selectedDashboard?.visibility ?? "personal";
  const description = draft?.description ?? selectedDashboard?.description ?? "";
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-auto sm:max-w-[480px]" side="right">
        <SheetHeader>
          <SheetTitle>{t("dashboards.settings")}</SheetTitle>
          <SheetDescription>
            {selectedDashboard?.name ?? t("dashboards.empty.noSelection.title")}
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 gap-4 px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="settings-dashboard-name">{t("dashboards.name")}</FieldLabel>
              <Input
                disabled={!isEditing}
                id="settings-dashboard-name"
                onChange={(event) => {
                  if (draft) {
                    onDraftChange({ ...draft, name: event.target.value });
                  }
                }}
                value={name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-dashboard-visibility">
                {t("dashboards.visibility")}
              </FieldLabel>
              <Select
                disabled={!isEditing}
                onValueChange={(value) => {
                  if (draft) {
                    onDraftChange({ ...draft, visibility: value as "personal" | "project" });
                  }
                }}
                value={visibility === "builtin" ? "project" : visibility}
              >
                <SelectTrigger id="settings-dashboard-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="personal">{t("dashboards.rail.personal")}</SelectItem>
                    <SelectItem value="project">{t("dashboards.rail.project")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-dashboard-description">
                {t("dashboards.descriptionField")}
              </FieldLabel>
              <Textarea
                disabled={!isEditing}
                id="settings-dashboard-description"
                onChange={(event) => {
                  if (draft) {
                    onDraftChange({ ...draft, description: event.target.value || null });
                  }
                }}
                placeholder={t("dashboards.descriptionPlaceholder")}
                rows={4}
                value={description}
              />
            </Field>
          </FieldGroup>
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

function WidgetEditorSheet({
  dashboard,
  draft,
  onOpenChange,
  onWidgetChange,
  open,
  range,
  telemetryClient,
  widget,
}: {
  dashboard: Dashboard | null;
  draft: SaveDashboardInput | null;
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
          <SheetTitle>{editableWidget?.title ?? t("dashboards.details")}</SheetTitle>
          <SheetDescription>
            {editableWidget
              ? widgetKindLabel(editableWidget.kind)
              : (dashboard?.name ?? t("dashboards.empty.noSelection.title"))}
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 gap-4 px-4">
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
          [
            "metric_rich",
            <LineChart data-icon="inline-start" key="metric_rich" />,
            t("dashboards.widget.richMetric"),
          ],
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

function EmptyDashboardCanvas({
  actionLabel,
  description,
  onCreate,
  title,
}: {
  actionLabel?: string | undefined;
  description: string;
  onCreate?: (() => void) | undefined;
  title: string;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {onCreate && actionLabel ? (
        <Button onClick={onCreate} type="button">
          <Plus data-icon="inline-start" />
          {actionLabel}
        </Button>
      ) : null}
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
    title: widgetKindLabel(kind),
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

function widgetKindLabel(kind: DashboardWidgetKind) {
  switch (kind) {
    case "metric_stat":
      return t("dashboards.widget.metricStat");
    case "metric_table":
      return t("dashboards.widget.metricTable");
    case "metric_rich":
      return t("dashboards.widget.richMetric");
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
