import type { Dataset, TraceDetail } from "@cloudgrid/ui-contracts";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Copy, FileJson, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../components/ui/sheet";
import { formatDateTime, formatDuration } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { useTelemetryClient } from "../../providers/telemetry-client-provider";
import { compatibleTraceIntakeDatasets } from "../ai-eval/view-model-v2";
import { SpanFiltersDialog, SpanInspector } from "./span-inspector";
import {
  copyText,
  filterSpans,
  isTab,
  type LogsMode,
  selectedSpanFor,
  type TraceDetailFilters,
  type TraceViewMode,
  traceErrorSpanCount,
  traceSearchBackHref,
  traceSpanCount,
} from "./trace-detail-types";
import { TraceLogsPanel } from "./trace-logs-panel";
import { TraceWaterfallPanel } from "./trace-waterfall-panel";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function TraceWarnings({ detail }: { detail: TraceDetail }) {
  if (detail.warnings.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {detail.warnings.map((warning) => (
        <Alert
          className="border-destructive/30"
          key={`${warning.code}-${warning.spanId ?? "trace"}-${warning.message}`}
        >
          <AlertTitle>{t("traceDetail.warning")}</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export function TraceDetailView({
  datasets = [],
  detail,
  projectId = "",
  traceFilters,
}: {
  datasets?: Dataset[];
  detail: TraceDetail;
  projectId?: string;
  traceFilters: TraceDetailFilters;
}) {
  const initialViewMode = traceFilters.searchParams.get("view") === "flow" ? "flow" : "waterfall";
  const [viewMode, setViewMode] = useState<TraceViewMode>(initialViewMode);
  const [logsMode, setLogsMode] = useState<LogsMode>("selected");
  const [localSelectedSpanId, setLocalSelectedSpanId] = useState<string | null>(
    traceFilters.selectedSpanId,
  );
  useEffect(() => {
    setLocalSelectedSpanId(traceFilters.selectedSpanId);
  }, [traceFilters.selectedSpanId]);
  useEffect(() => {
    if (localSelectedSpanId && !detail.spans.some((span) => span.id === localSelectedSpanId)) {
      setLocalSelectedSpanId(traceFilters.selectedSpanId);
    }
  }, [detail.spans, localSelectedSpanId, traceFilters.selectedSpanId]);
  const selectedSpan = selectedSpanFor(detail, localSelectedSpanId);
  const visibleSpans = useMemo(() => filterSpans(detail, traceFilters), [detail, traceFilters]);
  const visibleSpanIds = useMemo(() => visibleSpans.map((span) => span.id), [visibleSpans]);
  const matchedSpanIds = useMemo(
    () => detail.spanMatches.map((match) => match.spanId),
    [detail.spanMatches],
  );
  const exactLogSpanIds = useMemo(
    () =>
      detail.relatedLogs
        .map((log) => log.spanId)
        .filter((spanId): spanId is string => Boolean(spanId)),
    [detail.relatedLogs],
  );
  const selectedTab = isTab(traceFilters.selectedTab) ? traceFilters.selectedTab : "attributes";
  const spanLogs = detail.relatedLogs.filter((log) => log.spanId === selectedSpan?.id);
  const selectedSpanLogs = spanLogs.length > 0 ? spanLogs : detail.relatedLogs;
  const visibleLogs = logsMode === "selected" ? selectedSpanLogs : detail.relatedLogs;
  const totalSpanCount = traceSpanCount(detail);
  const totalErrorSpanCount = traceErrorSpanCount(detail);
  const backHref = traceSearchBackHref(traceFilters.searchParams);

  const selectSpanId = (spanId: string) => {
    setLocalSelectedSpanId(spanId);
    setLogsMode("selected");
    traceFilters.setFilter("spanId", spanId);
  };
  const selectViewMode = (mode: TraceViewMode) => {
    setViewMode(mode);
    traceFilters.setFilter("view", mode === "flow" ? "flow" : null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <nav className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Button asChild aria-label={t("actions.backToTraces")} size="icon-sm" variant="outline">
          <Link to={backHref}>
            <ArrowLeft />
          </Link>
        </Button>
        <Link className="hover:text-foreground" to={backHref}>
          {t("traces.title")}
        </Link>
        <span>/</span>
        <span className="truncate font-mono text-foreground">{detail.trace.id}</span>
      </nav>

      <section className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-normal">
              {detail.trace.serviceName ?? t("value.unknown")}
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm",
                detail.trace.status === "error" && "font-medium text-error",
              )}
            >
              {detail.trace.status === "error" ? <AlertTriangle className="size-4" /> : null}
              {detail.trace.status ?? t("value.unknown")}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-mono">{detail.trace.id}</span>
            <Button
              aria-label={t("actions.copy")}
              onClick={() => copyText(detail.trace.id)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Copy />
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
          <TraceDetailDatasetCandidateDialog
            datasets={datasets}
            detail={detail}
            projectId={projectId}
            selectedSpan={selectedSpan}
          />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-5 gap-y-2">
            <Metric
              label={t("traces.column.duration")}
              value={formatDuration(detail.trace.durationMs)}
            />
            <Metric
              label={t("traces.column.started")}
              value={formatDateTime(detail.trace.startedAt)}
            />
            <Metric label={t("traces.column.spans")} value={totalSpanCount} />
            <Metric label={t("traces.column.errorSpans")} value={totalErrorSpanCount} />
            <Metric label={t("traces.column.logs")} value={detail.relatedLogs.length} />
          </div>
        </div>
      </section>

      <TraceWarnings detail={detail} />

      <div className="flex flex-col gap-3 lg:hidden">
        <TraceWaterfallPanel
          detail={detail}
          exactLogSpanIds={exactLogSpanIds}
          headerActions={<SpanFiltersDialog traceFilters={traceFilters} />}
          matchedSpanIds={matchedSpanIds}
          onSelectSpanId={selectSpanId}
          selectedSpanId={selectedSpan?.id ?? null}
          setViewMode={selectViewMode}
          variant="mobile"
          visibleSpanIds={visibleSpanIds}
          viewMode={viewMode}
        />
        <TraceLogsPanel logs={visibleLogs} mode={logsMode} setMode={setLogsMode} />
        <Sheet>
          <SheetTrigger asChild>
            <Button className="w-full" type="button" variant="outline">
              <Filter data-icon="inline-start" />
              {t("traceDetail.selectedSpan")}
            </Button>
          </SheetTrigger>
          <SheetContent className="max-h-[85vh]" side="bottom">
            <SheetHeader>
              <SheetTitle>{t("traceDetail.selectedSpan")}</SheetTitle>
              <SheetDescription>
                {selectedSpan?.name ?? t("traceDetail.noSelectedSpan")}
              </SheetDescription>
            </SheetHeader>
            <SpanInspector
              currentTraceId={detail.trace.id}
              onSelectSpanId={selectSpanId}
              selectedSpan={selectedSpan}
              selectedTab={selectedTab}
              setTab={(tab) => traceFilters.setFilter("tab", tab)}
            />
          </SheetContent>
        </Sheet>
      </div>
      <ResizablePanelGroup
        className="hidden min-h-0 flex-1 overflow-hidden rounded-md border bg-background lg:flex"
        orientation="horizontal"
      >
        <ResizablePanel className="min-h-0 overflow-hidden" defaultSize="68%" minSize="48%">
          <ResizablePanelGroup
            className="h-full min-w-0 overflow-hidden bg-background p-3"
            orientation="vertical"
          >
            <ResizablePanel
              className="min-h-0 overflow-hidden"
              defaultSize="70%"
              maxSize="85%"
              minSize="45%"
            >
              <TraceWaterfallPanel
                detail={detail}
                exactLogSpanIds={exactLogSpanIds}
                headerActions={<SpanFiltersDialog traceFilters={traceFilters} />}
                matchedSpanIds={matchedSpanIds}
                onSelectSpanId={selectSpanId}
                selectedSpanId={selectedSpan?.id ?? null}
                setViewMode={selectViewMode}
                variant="desktop"
                visibleSpanIds={visibleSpanIds}
                viewMode={viewMode}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel className="min-h-0 overflow-hidden" defaultSize="30%" minSize="15%">
              <TraceLogsPanel logs={visibleLogs} mode={logsMode} setMode={setLogsMode} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          className="min-h-0 overflow-hidden"
          defaultSize="420px"
          groupResizeBehavior="preserve-pixel-size"
          maxSize="640px"
          minSize="360px"
        >
          <SpanInspector
            currentTraceId={detail.trace.id}
            onSelectSpanId={selectSpanId}
            selectedSpan={selectedSpan}
            selectedTab={selectedTab}
            setTab={(tab) => traceFilters.setFilter("tab", tab)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function TraceDetailDatasetCandidateDialog({
  datasets,
  detail,
  projectId,
  selectedSpan,
}: {
  datasets: Dataset[];
  detail: TraceDetail;
  projectId: string;
  selectedSpan: TraceDetail["spans"][number] | null | undefined;
}) {
  const compatible = compatibleTraceIntakeDatasets(datasets);
  const traceRefs = [{ traceId: detail.trace.id }];
  const spanRefs = selectedSpan ? [{ traceId: detail.trace.id, spanId: selectedSpan.id }] : [];
  const telemetryClient = useTelemetryClient();
  const mutation = useMutation({
    mutationFn: () =>
      telemetryClient.prepareDatasetCandidates({
        projectId,
        autoMatchDatasets: true,
        traceSelection: {
          mode: "selected",
          traceRefs,
          spanRefs,
        },
        previewLimit: 100,
        curationStatus: "needs_expected",
        contentTreatment: "realistic_anonymized",
        idempotencyKey: `trace-detail-candidates-${detail.trace.id}-${Date.now()}`,
      }),
  });
  const preparedCount = mutation.data?.items.length ?? 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={!projectId} size="sm" type="button" variant="outline">
          <FileJson data-icon="inline-start" />
          {t("traces.prepareDatasetRows.action")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("traces.prepareDatasetRows.title")}</DialogTitle>
          <DialogDescription>
            {t(
              selectedSpan
                ? "traces.prepareDatasetRows.detailDescriptionWithSpan"
                : "traces.prepareDatasetRows.detailDescription",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{t("traces.prepareDatasetRows.selectedEvidence")}</div>
            <div className="mt-1 grid gap-1 text-muted-foreground">
              <span className="font-mono">trace: {detail.trace.id}</span>
              {selectedSpan ? (
                <span className="font-mono">
                  {t("traces.prepareDatasetRows.selectedSpan", { spanId: selectedSpan.id })}
                </span>
              ) : (
                <span>{t("traces.prepareDatasetRows.noSelectedSpan")}</span>
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
            {t(
              spanRefs.length
                ? "traces.prepareDatasetRows.detailPreviewNoteWithSpan"
                : "traces.prepareDatasetRows.detailPreviewNote",
              { traceCount: String(traceRefs.length) },
            )}
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
            disabled={!projectId || compatible.length === 0 || mutation.isPending}
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
