import type { Span, TraceDetail } from "@cloudgrid/ui-contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitBranch, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../components/ui/sheet";
import { Skeleton } from "../../components/ui/skeleton";
import { formatDateTime, formatDuration, statusVariant } from "../../lib/format";
import { t } from "../../lib/i18n";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import { useTelemetryClient } from "../../providers/telemetry-client-provider";

function selectedSpanFor(detail: TraceDetail, spanId?: string | null) {
  return (
    detail.selectedSpan ??
    detail.spans.find((span) => span.id === spanId) ??
    detail.spans.find((span) => span.id === detail.trace.rootSpanId) ??
    detail.spans[0] ??
    null
  );
}

function spanOffset(detail: TraceDetail, span: Span) {
  const durationMs = detail.trace.durationMs;

  if (!durationMs || durationMs <= 0) {
    return 0;
  }

  const offsetMs = new Date(span.startedAt).getTime() - new Date(detail.trace.startedAt).getTime();
  return Math.max(0, Math.min(100, (offsetMs / durationMs) * 100));
}

function spanWidth(detail: TraceDetail, span: Span) {
  const durationMs = detail.trace.durationMs;

  if (!durationMs || durationMs <= 0) {
    return 4;
  }

  return Math.max(2, Math.min(100, (span.durationMs / durationMs) * 100));
}

function traceSpanCount(detail: TraceDetail) {
  return detail.structure.serviceBreakdown.reduce((sum, service) => sum + service.spanCount, 0);
}

function traceErrorSpanCount(detail: TraceDetail) {
  return detail.structure.serviceBreakdown.reduce(
    (sum, service) => sum + service.errorSpanCount,
    0,
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function TracePreviewMinimap({
  detail,
  selectedSpan,
}: {
  detail: TraceDetail;
  selectedSpan: Span | null;
}) {
  const spans = useMemo(
    () =>
      [...detail.spans]
        .sort(
          (left, right) =>
            new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime() ||
            left.depth - right.depth,
        )
        .slice(0, 90),
    [detail.spans],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t("traceDetail.overview")}</h3>
        <span className="text-xs text-muted-foreground">
          {formatDuration(detail.trace.durationMs)}
        </span>
      </div>
      <div
        aria-label={t("traceDetail.overview")}
        className="relative h-20 overflow-hidden rounded-md border bg-muted/30"
        role="img"
      >
        <div className="absolute inset-x-3 top-1/2 h-px bg-border" />
        {spans.map((span, index) => {
          const selected = span.id === selectedSpan?.id;
          return (
            <div
              aria-hidden
              className={cn(
                "absolute h-3 rounded-[2px]",
                span.hasError
                  ? "bg-destructive"
                  : span.isCriticalPath
                    ? "bg-primary"
                    : "bg-secondary-foreground/50",
                selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
              )}
              key={span.id}
              style={{
                left: `${spanOffset(detail, span)}%`,
                top: `${12 + (index % 4) * 13}px`,
                width: `${spanWidth(detail, span)}%`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PreviewContent({
  detail,
  selectedSpan,
}: {
  detail: TraceDetail;
  selectedSpan: Span | null;
}) {
  const totalSpanCount = traceSpanCount(detail);
  const totalErrorSpanCount = traceErrorSpanCount(detail);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
      <section className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
        <Metric label={t("traces.column.trace")} value={detail.trace.id} />
        <Metric
          label={t("logs.column.service")}
          value={detail.trace.serviceName ?? t("value.unknown")}
        />
        <Metric label={t("traces.column.started")} value={formatDateTime(detail.trace.startedAt)} />
        <Metric
          label={t("traces.column.duration")}
          value={formatDuration(detail.trace.durationMs)}
        />
        <Metric label={t("traces.column.spans")} value={totalSpanCount} />
        <Metric label={t("traces.column.errorSpans")} value={totalErrorSpanCount} />
      </section>

      <TracePreviewMinimap detail={detail} selectedSpan={selectedSpan} />

      <section className="flex flex-col gap-3 rounded-md border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">{t("traceDetail.selectedSpan")}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {selectedSpan?.name ?? t("traceDetail.noSelectedSpan")}
            </p>
          </div>
          {selectedSpan ? (
            <Badge variant={statusVariant(selectedSpan.status)}>
              {selectedSpan.status ?? t("value.unknown")}
            </Badge>
          ) : null}
        </div>
        {selectedSpan ? (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Metric
              label={t("logs.column.service")}
              value={selectedSpan.serviceName ?? t("value.unknown")}
            />
            <Metric label={t("traceDetail.kind")} value={selectedSpan.kind ?? t("value.unknown")} />
            <Metric
              label={t("traceDetail.duration")}
              value={formatDuration(selectedSpan.durationMs)}
            />
            <Metric
              label={t("traceDetail.started")}
              value={formatDateTime(selectedSpan.startedAt)}
            />
            <Metric label={t("traceDetail.depth")} value={selectedSpan.depth} />
            <Metric label={t("traceDetail.exceptionMarkers")} value={selectedSpan.exceptionCount} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function LogTracePreview({
  traceId,
  spanId,
}: {
  traceId?: string | null;
  spanId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const client = useTelemetryClient();
  const input = useMemo(() => ({ selectedSpanId: spanId ?? null }), [spanId]);
  const query = useQuery({
    enabled: open && Boolean(traceId),
    queryKey: queryKeys.trace(traceId ?? "", input),
    queryFn: () => client.getTrace(traceId ?? "", input),
  });
  const selectedSpan = query.data ? selectedSpanFor(query.data, spanId) : null;
  const fullTracePath = `/traces/${traceId}${spanId ? `?spanId=${spanId}` : ""}`;

  if (!traceId) {
    return null;
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button aria-label={t("traceDetail.overview")} size="icon-sm" type="button" variant="ghost">
          <GitBranch />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>{t("traceDetail.title")}</SheetTitle>
          <SheetDescription className="font-mono">{traceId}</SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <div className="flex flex-col gap-3 px-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : null}

        {query.isError ? (
          <div className="mx-4 flex flex-col gap-3 rounded-md border p-3">
            <div>
              <h3 className="text-sm font-medium">{t("state.error.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("state.error.description")}</p>
            </div>
            <Button onClick={() => void query.refetch()} type="button" variant="outline">
              <RefreshCw data-icon="inline-start" />
              {t("actions.retry")}
            </Button>
          </div>
        ) : null}

        {query.isSuccess && query.data ? (
          <PreviewContent detail={query.data} selectedSpan={selectedSpan} />
        ) : null}

        {query.isSuccess && query.data === null ? (
          <div className="mx-4 rounded-md border p-3">
            <h3 className="text-sm font-medium">{t("traceDetail.notFound.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("traceDetail.notFound.description")}</p>
          </div>
        ) : null}

        <SheetFooter>
          <Button asChild type="button" variant="outline">
            <Link to={fullTracePath}>
              <ExternalLink data-icon="inline-start" />
              {t("traceDetail.title")}
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
