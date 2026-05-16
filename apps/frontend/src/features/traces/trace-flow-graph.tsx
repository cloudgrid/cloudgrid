import type { TraceDetail } from "@cloudgrid/ui-contracts";
import { AlertTriangle, Maximize2, Minus, Move, Plus, RotateCcw } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { formatDuration } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { sortSpans } from "./trace-detail-types";

function isFlowNodeInteraction(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-flow-span-id]"));
}

export function TraceFlowGraph({
  detail,
  onSelectSpanId,
  selectedSpanId,
}: {
  detail: TraceDetail;
  onSelectSpanId: (spanId: string) => void;
  selectedSpanId?: string | null;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const nodeWidth = 248;
  const nodeHeight = 96;
  const columnGap = 112;
  const rowGap = 28;
  const leftPadding = 56;
  const topPadding = 48;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const spans = sortSpans(detail.spans).slice(0, 80);
  const positions = new Map<string, { x: number; y: number }>();
  const depthCounts = new Map<number, number>();

  for (const span of spans) {
    const index = depthCounts.get(span.depth) ?? 0;
    depthCounts.set(span.depth, index + 1);
    positions.set(span.id, {
      x: leftPadding + span.depth * (nodeWidth + columnGap),
      y: topPadding + index * (nodeHeight + rowGap),
    });
  }

  const width = Math.max(
    880,
    leftPadding * 2 +
      (detail.structure.maxDepth + 1) * nodeWidth +
      detail.structure.maxDepth * columnGap,
  );
  const maxDepthRows = Math.max(...depthCounts.values(), 1);
  const height = Math.max(420, topPadding * 2 + maxDepthRows * nodeHeight + maxDepthRows * rowGap);
  const logCountsBySpanId = new Map<string, number>();
  for (const log of detail.relatedLogs) {
    if (log.spanId) {
      logCountsBySpanId.set(log.spanId, (logCountsBySpanId.get(log.spanId) ?? 0) + 1);
    }
  }

  return (
    <section
      aria-label={t("traceDetail.flowMap")}
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border bg-background fullscreen:h-screen"
      data-trace-flow
      ref={sectionRef}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">{t("traceDetail.flowGraph")}</h2>
          <p className="text-xs text-muted-foreground">{spans.length} spans</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label={t("traceDetail.zoomOut")}
            onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Minus />
          </Button>
          <Button
            aria-label={t("traceDetail.zoomIn")}
            onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Plus />
          </Button>
          <Button
            aria-label={t("traceDetail.resetFlow")}
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <RotateCcw />
          </Button>
          <Button
            aria-label={t("traceDetail.openFullscreenFlow")}
            onClick={() => void sectionRef.current?.requestFullscreen?.()}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Maximize2 />
          </Button>
          <Move className="ml-1 size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <div
        className="min-h-0 flex-1 touch-none cursor-grab overflow-auto overscroll-contain active:cursor-grabbing"
        onPointerDown={(event) => {
          if (isFlowNodeInteraction(event.target)) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }
          event.preventDefault();
          setPan({
            x: drag.panX - (event.clientX - drag.startX) / zoom,
            y: drag.panY - (event.clientY - drag.startY) / zoom,
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = null;
          }
        }}
      >
        <svg
          className="block"
          height={height * zoom}
          role="img"
          viewBox={`${pan.x} ${pan.y} ${width} ${height}`}
          width={width * zoom}
        >
          <title>Trace flow map</title>
          <defs>
            <marker
              id="trace-flow-arrow"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
            </marker>
          </defs>
          {spans.map((span) => {
            const position = positions.get(span.id);
            const parentPosition = span.parentSpanId ? positions.get(span.parentSpanId) : null;
            if (!position || !parentPosition) {
              return null;
            }
            const startX = parentPosition.x + nodeWidth;
            const startY = parentPosition.y + nodeHeight / 2;
            const endX = position.x;
            const endY = position.y + nodeHeight / 2;
            const midX = startX + Math.max(48, (endX - startX) / 2);
            return (
              <path
                className={cn("text-border", span.status === "error" && "text-destructive")}
                d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX - 8} ${endY}`}
                key={`${span.id}-edge`}
                fill="none"
                markerEnd="url(#trace-flow-arrow)"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth={span.status === "error" ? 2.5 : 2}
              />
            );
          })}
          {spans.map((span) => {
            const position = positions.get(span.id);
            if (!position) {
              return null;
            }
            const selected = span.id === selectedSpanId;
            const markers = [
              span.events.length ? `${span.events.length} ${t("traceDetail.eventMarkers")}` : null,
              span.exceptionCount
                ? `${span.exceptionCount} ${t("traceDetail.exceptionMarkers")}`
                : null,
              span.links.length ? `${span.links.length} ${t("traceDetail.linkMarkers")}` : null,
              logCountsBySpanId.get(span.id)
                ? `${logCountsBySpanId.get(span.id)} ${t("traces.column.logs")}`
                : null,
            ].filter(Boolean);
            return (
              <g key={span.id} transform={`translate(${position.x} ${position.y})`}>
                <foreignObject height={nodeHeight} width={nodeWidth}>
                  <Button
                    className={cn(
                      "h-full w-full rounded-md border bg-background px-3 py-2 text-left text-xs whitespace-normal hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "border-foreground bg-muted",
                    )}
                    aria-pressed={selected}
                    data-flow-span-id={span.id}
                    onPointerDown={(event: PointerEvent<HTMLButtonElement>) =>
                      event.stopPropagation()
                    }
                    onClick={() => onSelectSpanId(span.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <span className="block max-h-9 overflow-hidden break-words font-medium leading-4">
                      {span.name}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {span.serviceName ?? t("value.unknown")}
                    </span>
                    <span
                      className={cn(
                        "mt-1 flex min-w-0 items-center gap-1 truncate",
                        span.status === "error" && "font-medium text-error",
                      )}
                    >
                      {span.status === "error" ? <AlertTriangle className="size-3" /> : null}
                      {span.status ?? "unset"} · {formatDuration(span.durationMs)}
                    </span>
                    {markers.length > 0 ? (
                      <span className="mt-1 block truncate text-[10px] leading-3 text-muted-foreground">
                        {markers.join(" · ")}
                      </span>
                    ) : null}
                  </Button>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
