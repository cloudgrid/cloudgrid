import type { Span, Trace } from "@cloudgrid/ui-contracts";
import { useMemo } from "react";
import { Button } from "../../components/ui/button";
import { formatDuration } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import {
  buildTraceTreeIndexes,
  getSpanDurationPercent,
  getSpanStartOffsetPercent,
} from "./trace-tree-model";

export interface TraceOverviewMinimapProps {
  trace: Trace;
  spans: Span[];
  selectedSpanId?: string | null;
  matchedSpanIds?: Iterable<string>;
  criticalPathSpanIds?: Iterable<string>;
  className?: string;
  onSelectSpanId?: (spanId: string) => void;
}

function setFromIterable(values?: Iterable<string>) {
  return new Set(values ?? []);
}

export function TraceOverviewMinimap({
  trace,
  spans,
  selectedSpanId,
  matchedSpanIds,
  criticalPathSpanIds,
  className,
  onSelectSpanId,
}: TraceOverviewMinimapProps) {
  const matchedSpanIdSet = useMemo(() => setFromIterable(matchedSpanIds), [matchedSpanIds]);
  const criticalPathSpanIdSet = useMemo(
    () => setFromIterable(criticalPathSpanIds),
    [criticalPathSpanIds],
  );
  const indexes = useMemo(
    () =>
      buildTraceTreeIndexes({
        spans,
        traceStartedAt: trace.startedAt,
        traceDurationMs: trace.durationMs,
        rootSpanIds: trace.rootSpanId ? [trace.rootSpanId] : [],
      }),
    [spans, trace.durationMs, trace.rootSpanId, trace.startedAt],
  );

  const markers = useMemo(
    () =>
      spans.map((span, index) => ({
        span,
        offset: getSpanStartOffsetPercent(indexes, span),
        width: getSpanDurationPercent(indexes, span),
        lane: Math.min(5, Math.max(0, span.depth % 6)),
        isSelected: span.id === selectedSpanId,
        isMatch: matchedSpanIdSet.has(span.id),
        isCriticalPath: criticalPathSpanIdSet.has(span.id) || span.isCriticalPath,
        key: `${span.id}-${index}`,
      })),
    [criticalPathSpanIdSet, indexes, matchedSpanIdSet, selectedSpanId, spans],
  );

  const selectedMarker = markers.find((marker) => marker.isSelected);
  const errorMarkers = markers.filter((marker) => marker.span.hasError);
  const searchMarkers = markers.filter((marker) => marker.isMatch);
  const criticalMarkers = markers.filter((marker) => marker.isCriticalPath);

  return (
    <section className={cn("rounded-md border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t("traceDetail.overview")}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {spans.length} spans · {formatDuration(trace.durationMs)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-error" />
            {errorMarkers.length} errors
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-trace" />
            {criticalMarkers.length} critical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-info" />
            {searchMarkers.length} matches
          </span>
        </div>
      </div>

      <div className="relative h-28 overflow-hidden px-3 py-3">
        <svg
          aria-hidden
          className="absolute inset-x-3 top-3 h-[72px] w-[calc(100%-1.5rem)]"
          preserveAspectRatio="none"
          viewBox="0 0 100 72"
        >
          <title>{t("traceDetail.overview")}</title>
          <rect className="fill-muted/60" height="72" rx="2" width="100" x="0" y="0" />
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                className="stroke-border"
                strokeDasharray={tick === 0 || tick === 100 ? undefined : "2 2"}
                x1={tick}
                x2={tick}
                y1="0"
                y2="72"
              />
              <text
                className="fill-muted-foreground text-[6px]"
                textAnchor={tick === 100 ? "end" : tick === 0 ? "start" : "middle"}
                x={tick}
                y="70"
              >
                {tick}%
              </text>
            </g>
          ))}
          {markers.map((marker) => (
            <rect
              className={cn(
                "fill-secondary",
                marker.isCriticalPath && "fill-trace",
                marker.span.hasError && "fill-error",
                marker.isMatch && !marker.span.hasError && "fill-info",
              )}
              height="6"
              key={marker.key}
              opacity={marker.isSelected ? "1" : "0.72"}
              rx="1.5"
              width={Math.max(0.35, Math.min(100 - marker.offset, marker.width))}
              x={marker.offset}
              y={6 + marker.lane * 9}
            />
          ))}
          {selectedMarker ? (
            <line
              className="stroke-primary"
              strokeWidth="0.8"
              x1={selectedMarker.offset}
              x2={selectedMarker.offset}
              y1="0"
              y2="72"
            />
          ) : null}
        </svg>

        <div className="absolute inset-x-3 top-3 h-[72px]">
          {markers.map((marker) => {
            const markerWidth = Math.max(8, Math.min(28, marker.width * 1.8));

            return (
              <Button
                aria-label={`${t("traceDetail.selectSpan")} ${marker.span.name}`}
                className={cn(
                  "absolute rounded-[3px] border border-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  marker.isSelected && "border-primary bg-primary/10",
                )}
                key={marker.key}
                onClick={() => onSelectSpanId?.(marker.span.id)}
                size="icon-xs"
                style={{
                  height: "10px",
                  left: `${marker.offset}%`,
                  top: `${5 + marker.lane * 9}px`,
                  width: `${markerWidth}px`,
                }}
                title={`${marker.span.name} · ${formatDuration(marker.span.durationMs)}`}
                type="button"
                variant="ghost"
              />
            );
          })}
        </div>

        <div className="absolute inset-x-3 bottom-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>0 ms</span>
          <span className="truncate font-mono">
            {selectedMarker?.span.id ?? t("traceDetail.noSpanSelected")}
          </span>
          <span>{formatDuration(trace.durationMs)}</span>
        </div>
      </div>
    </section>
  );
}
