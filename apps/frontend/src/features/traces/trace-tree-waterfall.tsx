import type { Span } from "@cloudgrid/ui-contracts";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ChevronsDownUp,
  FileText,
  Flame,
  LinkIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { formatDuration } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import {
  buildInitialExpandedSpanIds,
  buildTraceTreeIndexes,
  expandSelectedSpanPath,
  flattenTraceTree,
  isDescendantOf,
  MISSING_PARENT_GROUP_ID,
  type TraceTreeRow,
} from "./trace-tree-model";

export interface TraceTreeWaterfallProps {
  spans: Span[];
  traceStartedAt: string;
  traceStartedAtUnixNano?: string | null;
  traceDurationNano?: string | null;
  traceDurationMs?: number | null;
  rootSpanIds?: readonly string[];
  orphanSpanIds?: readonly string[];
  selectedSpanId?: string | null;
  matchedSpanIds?: Iterable<string>;
  filterVisibleSpanIds?: Iterable<string>;
  criticalPathSpanIds?: Iterable<string>;
  exactLogSpanIds?: Iterable<string>;
  headerActions?: ReactNode;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  onSelectSpanId?: (spanId: string) => void;
  onCollapseSelectedDescendant?: (parentSpanId: string, previousSelectedSpanId: string) => void;
}

const timelineTicks = [0, 25, 50, 75, 100] as const;
const virtualizationThreshold = 500;
const expandAllLimit = 2_000;

function setFromIterable(values?: Iterable<string>) {
  return new Set(values ?? []);
}

function rowDomId(rowId: string) {
  return `trace-tree-row-${rowId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function MarkerTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface TraceTreeWaterfallRowProps {
  row: TraceTreeRow;
  focused: boolean;
  compact: boolean;
  onToggleExpanded: (spanId: string) => void;
  onSelectSpanId?: ((spanId: string) => void) | undefined;
}

const TraceTreeWaterfallRow = memo(function TraceTreeWaterfallRow({
  row,
  focused,
  compact,
  onToggleExpanded,
  onSelectSpanId,
}: TraceTreeWaterfallRowProps) {
  const span = row.span;
  const isGroup = row.kind === "missing-parent-group";
  const label = span?.name ?? t("traceDetail.missingParentSpans");
  const serviceName =
    span?.serviceName ?? (isGroup ? t("traceDetail.traceStructure") : t("value.unknown"));
  const rowHeightClass = compact ? "min-h-8" : "min-h-10";
  const expandLabel = row.isExpanded ? t("actions.collapse") : t("actions.expand");

  return (
    <div
      aria-expanded={row.hasVisibleChildren ? row.isExpanded : undefined}
      aria-level={row.depth}
      aria-selected={row.isSelected}
      className={cn(
        "grid w-full min-w-[860px] grid-cols-[28px_minmax(120px,0.42fr)_minmax(220px,0.9fr)_92px_86px_minmax(260px,1.35fr)] items-center gap-2 border-b px-2 text-sm outline-none transition-colors sm:min-w-[940px]",
        rowHeightClass,
        row.isSelected && "bg-trace/10 text-foreground",
        focused && "ring-1 ring-inset ring-ring",
        row.isMutedAncestor && "text-muted-foreground",
        isGroup && "bg-warning/5",
      )}
      id={rowDomId(row.rowId)}
      onClick={() => {
        if (span) {
          onSelectSpanId?.(span.id);
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && span) {
          event.preventDefault();
          onSelectSpanId?.(span.id);
        }
      }}
      role="treeitem"
      tabIndex={-1}
    >
      <Button
        aria-label={`${expandLabel} ${label}`}
        className={cn("size-6", !row.hasVisibleChildren && "invisible")}
        onClick={(event) => {
          event.stopPropagation();
          onToggleExpanded(row.spanId);
        }}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        {row.isExpanded ? <Minus /> : <Plus />}
      </Button>

      <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
        <span
          aria-hidden
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-[3px] bg-chart-1",
            row.hasError && "bg-error",
            row.isCriticalPath && !row.hasError && "bg-trace",
            isGroup && "bg-warning",
          )}
        />
        <span className="truncate text-xs text-muted-foreground">{serviceName}</span>
      </div>

      <div className="min-w-0" style={{ paddingLeft: `${Math.min(row.depth - 1, 8) * 14}px` }}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{label}</span>
          {row.isMatch ? <Search className="size-3 shrink-0 text-info" aria-label="match" /> : null}
        </div>
        <div className="flex min-w-0 gap-1 text-[11px] text-muted-foreground sm:hidden">
          <span className="truncate">{serviceName}</span>
          {span?.kind ? <span className="truncate">{span.kind}</span> : null}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1">
        {span ? (
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-1 truncate text-xs",
              span.status === "error" && "font-medium text-error",
            )}
          >
            {span.status === "error" ? <AlertTriangle className="size-3 shrink-0" /> : null}
            {span.status ?? "unset"}
          </span>
        ) : (
          <span className="text-xs text-warning">warning</span>
        )}
      </div>

      <div className="text-right font-mono text-xs">
        {span ? formatDuration(span.durationMs) : `${row.childCount}`}
      </div>

      <div className="relative h-7 rounded-sm bg-muted/50">
        <div
          className={cn(
            "absolute top-1.5 h-4 min-w-1 rounded-[3px] bg-secondary",
            row.hasError && "bg-error",
            row.isCriticalPath && !row.hasError && "bg-trace",
            isGroup && "bg-warning/60",
          )}
          style={{
            left: `${row.startOffsetPercent}%`,
            width: `${row.durationPercent}%`,
          }}
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-1">
          {row.hasError ? (
            <MarkerTooltip label={t("traceDetail.errorSpan")}>
              <AlertTriangle className="size-3 text-error" />
            </MarkerTooltip>
          ) : null}
          {row.isCriticalPath ? (
            <MarkerTooltip label={t("traceDetail.criticalPath")}>
              <Flame className="size-3 text-trace" />
            </MarkerTooltip>
          ) : null}
          {row.hasLogs ? (
            <MarkerTooltip label={t("traceDetail.exactSpanLogs")}>
              <FileText className="size-3 text-info" />
            </MarkerTooltip>
          ) : null}
          {(span?.links.length ?? 0) > 0 ? (
            <MarkerTooltip label={t("traceDetail.spanLinks")}>
              <LinkIcon className="size-3 text-muted-foreground" />
            </MarkerTooltip>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function TimelineHeader() {
  return (
    <div className="sticky top-0 z-10 grid min-w-[860px] grid-cols-[28px_minmax(120px,0.42fr)_minmax(220px,0.9fr)_92px_86px_minmax(260px,1.35fr)] gap-2 border-b bg-background px-2 py-2 text-[11px] font-medium uppercase text-muted-foreground sm:min-w-[940px]">
      <span />
      <span className="hidden sm:block">{t("filters.service")}</span>
      <span>{t("traceDetail.span")}</span>
      <span>{t("filters.status")}</span>
      <span className="text-right">{t("traceDetail.duration")}</span>
      <div className="relative h-5">
        {timelineTicks.map((tick) => (
          <span
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5"
            key={tick}
            style={{ left: `${tick}%` }}
          >
            <span className="h-2 w-px bg-border" />
            <span>{tick}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function TraceTreeWaterfall({
  spans,
  traceStartedAt,
  traceStartedAtUnixNano,
  traceDurationNano,
  traceDurationMs,
  rootSpanIds,
  orphanSpanIds,
  selectedSpanId,
  matchedSpanIds,
  filterVisibleSpanIds,
  criticalPathSpanIds,
  exactLogSpanIds,
  headerActions,
  compact = true,
  className,
  ariaLabel = t("traceDetail.treeWaterfall"),
  onSelectSpanId,
  onCollapseSelectedDescendant,
}: TraceTreeWaterfallProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const matchedSpanIdSet = useMemo(() => setFromIterable(matchedSpanIds), [matchedSpanIds]);
  const filterVisibleSpanIdSet = useMemo(
    () => (filterVisibleSpanIds ? setFromIterable(filterVisibleSpanIds) : undefined),
    [filterVisibleSpanIds],
  );
  const criticalPathSpanIdSet = useMemo(
    () => setFromIterable(criticalPathSpanIds),
    [criticalPathSpanIds],
  );
  const exactLogSpanIdSet = useMemo(() => setFromIterable(exactLogSpanIds), [exactLogSpanIds]);
  const indexes = useMemo(
    () =>
      buildTraceTreeIndexes({
        spans,
        traceStartedAt,
        traceStartedAtUnixNano,
        traceDurationNano,
        traceDurationMs,
        rootSpanIds,
        orphanSpanIds,
      }),
    [
      spans,
      traceStartedAt,
      traceStartedAtUnixNano,
      traceDurationNano,
      traceDurationMs,
      rootSpanIds,
      orphanSpanIds,
    ],
  );
  const errorSpanIds = useMemo(
    () => new Set(spans.filter((span) => span.hasError).map((span) => span.id)),
    [spans],
  );
  const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(() =>
    expandSelectedSpanPath(
      buildInitialExpandedSpanIds({
        indexes,
        selectedSpanId: null,
        criticalPathSpanIds: criticalPathSpanIdSet,
        errorSpanIds,
      }),
      indexes,
      selectedSpanId,
    ),
  );

  useEffect(() => {
    setExpandedSpanIds(
      buildInitialExpandedSpanIds({
        indexes,
        selectedSpanId: null,
        criticalPathSpanIds: criticalPathSpanIdSet,
        errorSpanIds,
      }),
    );
  }, [indexes, criticalPathSpanIdSet, errorSpanIds]);

  useEffect(() => {
    if (selectedSpanId) {
      setExpandedSpanIds((current) => expandSelectedSpanPath(current, indexes, selectedSpanId));
    }
  }, [indexes, selectedSpanId]);

  const rows = useMemo(
    () =>
      flattenTraceTree({
        indexes,
        expandedSpanIds,
        selectedSpanId,
        matchedSpanIds: matchedSpanIdSet,
        filterVisibleSpanIds: filterVisibleSpanIdSet,
        criticalPathSpanIds: criticalPathSpanIdSet,
        exactLogSpanIds: exactLogSpanIdSet,
      }),
    [
      indexes,
      expandedSpanIds,
      selectedSpanId,
      matchedSpanIdSet,
      filterVisibleSpanIdSet,
      criticalPathSpanIdSet,
      exactLogSpanIdSet,
    ],
  );

  const [focusedRowId, setFocusedRowId] = useState<string | null>(selectedSpanId ?? null);

  useEffect(() => {
    if (selectedSpanId) {
      setFocusedRowId(selectedSpanId);
    }
  }, [selectedSpanId]);

  useEffect(() => {
    if (rows.length === 0) {
      setFocusedRowId(null);
      return;
    }

    if (!focusedRowId || rows.every((row) => row.rowId !== focusedRowId)) {
      setFocusedRowId(rows[0]?.rowId ?? null);
    }
  }, [focusedRowId, rows]);

  const rowHeight = compact ? 32 : 40;
  const shouldVirtualize = rows.length > virtualizationThreshold;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: compact ? 8 : 5,
  });

  const scrollFocusedRowIntoView = useCallback(
    (rowId: string) => {
      const index = rows.findIndex((row) => row.rowId === rowId);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: "auto" });
      }
    },
    [rows, virtualizer],
  );

  const toggleExpanded = useCallback(
    (spanId: string) => {
      setExpandedSpanIds((current) => {
        const next = new Set(current);
        const willCollapse = next.has(spanId);

        if (willCollapse) {
          next.delete(spanId);
          if (
            spanId !== MISSING_PARENT_GROUP_ID &&
            selectedSpanId &&
            isDescendantOf(indexes, selectedSpanId, spanId)
          ) {
            onCollapseSelectedDescendant?.(spanId, selectedSpanId);
            onSelectSpanId?.(spanId);
          }
        } else {
          next.add(spanId);
        }

        return next;
      });
    },
    [indexes, onCollapseSelectedDescendant, onSelectSpanId, selectedSpanId],
  );

  const focusRowAt = useCallback(
    (index: number) => {
      const nextRow = rows[Math.max(0, Math.min(rows.length - 1, index))];

      if (nextRow) {
        setFocusedRowId(nextRow.rowId);
        scrollFocusedRowIntoView(nextRow.rowId);
      }
    },
    [rows, scrollFocusedRowIntoView],
  );

  const onTreeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0) {
        return;
      }

      const focusedIndex = Math.max(
        0,
        rows.findIndex((row) => row.rowId === focusedRowId),
      );
      const focusedRow = rows[focusedIndex];

      if (!focusedRow) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusRowAt(focusedIndex + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          focusRowAt(focusedIndex - 1);
          break;
        case "ArrowRight": {
          event.preventDefault();
          if (focusedRow.hasVisibleChildren && !focusedRow.isExpanded) {
            toggleExpanded(focusedRow.spanId);
            break;
          }
          const childIndex = rows.findIndex((row) => row.parentSpanId === focusedRow.spanId);
          if (childIndex >= 0) {
            focusRowAt(childIndex);
          }
          break;
        }
        case "ArrowLeft":
          event.preventDefault();
          if (focusedRow.hasVisibleChildren && focusedRow.isExpanded) {
            toggleExpanded(focusedRow.spanId);
            break;
          }
          if (focusedRow.parentSpanId) {
            const parentIndex = rows.findIndex((row) => row.rowId === focusedRow.parentSpanId);
            if (parentIndex >= 0) {
              focusRowAt(parentIndex);
            }
          }
          break;
        case "Enter":
          if (focusedRow.span) {
            event.preventDefault();
            onSelectSpanId?.(focusedRow.span.id);
          }
          break;
        case "Home":
          event.preventDefault();
          focusRowAt(0);
          break;
        case "End":
          event.preventDefault();
          focusRowAt(rows.length - 1);
          break;
      }
    },
    [focusRowAt, focusedRowId, onSelectSpanId, rows, toggleExpanded],
  );

  const expandAllVisible = useCallback(() => {
    const next = new Set<string>();
    for (const row of rows) {
      if (row.hasVisibleChildren) {
        next.add(row.spanId);
      }
    }
    setExpandedSpanIds(next);
  }, [rows]);

  const collapseAllVisible = useCallback(() => {
    setExpandedSpanIds(new Set());
  }, []);

  const collapseToSelectedPath = useCallback(() => {
    setExpandedSpanIds(
      buildInitialExpandedSpanIds({
        indexes,
        selectedSpanId,
        criticalPathSpanIds: new Set(),
        errorSpanIds: new Set(),
      }),
    );
  }, [indexes, selectedSpanId]);

  if (spans.length === 0) {
    return (
      <section
        className={cn("flex min-h-48 items-center justify-center border bg-card", className)}
      >
        <p className="text-sm text-muted-foreground">{t("traceDetail.noSpanRows")}</p>
      </section>
    );
  }

  const focusedRowIndex = rows.findIndex((row) => row.rowId === focusedRowId);
  const hasExpandableRows = rows.some((row) => row.hasVisibleChildren);
  const hasSelectedSpan = Boolean(selectedSpanId);
  const activeDescendant =
    focusedRowId && rows.some((row) => row.rowId === focusedRowId)
      ? rowDomId(focusedRowId)
      : undefined;

  return (
    <TooltipProvider>
      <section className={cn("flex min-h-0 flex-col bg-card", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("traceDetail.treeWaterfall")}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {rows.length} {t("traceDetail.visibleSpans")} / {spans.length}{" "}
              {t("traces.column.spans")} · {formatDuration(traceDurationMs)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            {rows.length <= expandAllLimit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("actions.expandAllVisible")}
                    disabled={!hasExpandableRows}
                    onClick={expandAllVisible}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <Maximize2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("actions.expandAllVisible")}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                {t("traceDetail.largeTraceDescription")}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("actions.collapseAllVisible")}
                  disabled={!hasExpandableRows}
                  onClick={collapseAllVisible}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronsDownUp />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("actions.collapseAllVisible")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("actions.collapseToSelected")}
                  disabled={!hasSelectedSpan}
                  onClick={collapseToSelectedPath}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <Minimize2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("actions.collapseToSelected")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div
          aria-activedescendant={activeDescendant}
          aria-label={ariaLabel}
          className="min-h-0 flex-1 overflow-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onKeyDown={onTreeKeyDown}
          ref={parentRef}
          role="tree"
          tabIndex={0}
        >
          <TimelineHeader />
          {shouldVirtualize ? (
            <div
              className="relative"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];

                if (!row) {
                  return null;
                }

                return (
                  <div
                    className="absolute top-0 left-0 w-full"
                    key={row.rowId}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <TraceTreeWaterfallRow
                      compact={compact}
                      focused={virtualRow.index === focusedRowIndex}
                      onSelectSpanId={onSelectSpanId}
                      onToggleExpanded={toggleExpanded}
                      row={row}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            rows.map((row, index) => (
              <TraceTreeWaterfallRow
                compact={compact}
                focused={index === focusedRowIndex}
                key={row.rowId}
                onSelectSpanId={onSelectSpanId}
                onToggleExpanded={toggleExpanded}
                row={row}
              />
            ))
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}
