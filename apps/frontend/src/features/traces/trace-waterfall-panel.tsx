import type { TraceDetail } from "@cloudgrid/ui-contracts";
import { ListTree, Move } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { formatDuration } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { TraceViewMode } from "./trace-detail-types";
import { TraceFlowGraph } from "./trace-flow-graph";
import { TraceTreeWaterfall } from "./trace-tree-waterfall";

export interface TraceWaterfallPanelProps {
  detail: TraceDetail;
  exactLogSpanIds: string[];
  headerActions?: ReactNode;
  matchedSpanIds: string[];
  onSelectSpanId: (spanId: string) => void;
  selectedSpanId?: string | null;
  setViewMode: (mode: TraceViewMode) => void;
  visibleSpanIds: string[];
  viewMode: TraceViewMode;
  variant: "mobile" | "desktop";
}

export function TraceWaterfallPanel({
  detail,
  exactLogSpanIds,
  headerActions,
  matchedSpanIds,
  onSelectSpanId,
  selectedSpanId,
  setViewMode,
  visibleSpanIds,
  viewMode,
  variant,
}: TraceWaterfallPanelProps) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden",
        variant === "mobile" && "h-[640px] flex-none",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{t("traceDetail.treeWaterfall")}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {detail.trace.serviceName ?? t("value.unknown")} ·{" "}
              {formatDuration(detail.trace.durationMs)} · {visibleSpanIds.length}{" "}
              {t("traceDetail.visibleSpans")}
            </p>
          </div>
          <fieldset className="flex items-center gap-1 rounded-md border p-1">
            <legend className="sr-only">{t("traceDetail.traceView")}</legend>
            <Button
              onClick={() => setViewMode("waterfall")}
              size="sm"
              type="button"
              variant={viewMode === "waterfall" ? "secondary" : "ghost"}
            >
              <ListTree data-icon="inline-start" />
              {t("traceDetail.treeWaterfall")}
            </Button>
            <Button
              onClick={() => setViewMode("flow")}
              size="sm"
              type="button"
              variant={viewMode === "flow" ? "secondary" : "ghost"}
            >
              <Move data-icon="inline-start" />
              {t("traceDetail.flow")}
            </Button>
          </fieldset>
        </div>
        <div className="flex items-center gap-1">{headerActions}</div>
      </div>
      {viewMode === "flow" ? (
        <TraceFlowGraph
          detail={detail}
          onSelectSpanId={onSelectSpanId}
          selectedSpanId={selectedSpanId ?? null}
        />
      ) : (
        <TraceTreeWaterfall
          ariaLabel={t("traceDetail.treeWaterfall")}
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            variant === "mobile" && "h-[520px] flex-none rounded-md border",
          )}
          criticalPathSpanIds={detail.structure.criticalPathSpanIds}
          exactLogSpanIds={exactLogSpanIds}
          filterVisibleSpanIds={visibleSpanIds}
          headerActions={null}
          matchedSpanIds={matchedSpanIds}
          onCollapseSelectedDescendant={onSelectSpanId}
          onSelectSpanId={onSelectSpanId}
          orphanSpanIds={detail.structure.orphanSpanIds}
          rootSpanIds={detail.structure.rootSpanIds}
          selectedSpanId={selectedSpanId ?? null}
          spans={detail.spans}
          traceDurationNano={detail.trace.durationNano ?? null}
          traceDurationMs={detail.trace.durationMs ?? null}
          traceStartedAt={detail.trace.startedAt}
          traceStartedAtUnixNano={detail.trace.startedAtUnixNano}
        />
      )}
    </section>
  );
}
