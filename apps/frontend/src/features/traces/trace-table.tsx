import type { TraceSearchResult, TraceSort } from "@cloudgrid/ui-contracts";
import { useLocation, useNavigate } from "react-router-dom";
import { CopyButton } from "../../components/copy-button";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import {
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection,
} from "../../components/ui/table";
import { formatDateTime, formatDuration, statusVariant } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";

function traceOperation(trace: TraceSearchResult["items"][number]) {
  if (trace.operationName?.trim()) {
    return trace.operationName;
  }

  return trace.rootSpanId ?? t("value.unknown");
}

export function TraceTable({
  className,
  onSortChange,
  onSelectedTraceIdsChange,
  result,
  selectedTraceIds,
  sort,
}: {
  className?: string;
  onSortChange?: (sort: TraceSort | null) => void;
  onSelectedTraceIdsChange?: (traceIds: Set<string>) => void;
  result: TraceSearchResult;
  selectedTraceIds?: ReadonlySet<string>;
  sort?: TraceSort | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveSort = sort ?? null;
  const selectable = Boolean(selectedTraceIds && onSelectedTraceIdsChange);
  const selectedCount = result.items.filter((trace) => selectedTraceIds?.has(trace.id)).length;
  const allVisibleSelected = result.items.length > 0 && selectedCount === result.items.length;
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;
  const returnTo = `${location.pathname}${location.search}`;
  const traceHref = (traceId: string) =>
    `/traces/${encodeURIComponent(traceId)}?returnTo=${encodeURIComponent(returnTo)}`;
  const maxDuration = Math.max(
    1,
    ...result.items.map((trace) => trace.durationMs ?? 0).filter((duration) => duration > 0),
  );
  const sortDirection = (asc: TraceSort, desc: TraceSort): TableSortDirection => {
    if (effectiveSort === asc) {
      return "asc";
    }
    if (effectiveSort === desc) {
      return "desc";
    }
    return null;
  };
  const togglePairSort = (asc: TraceSort, desc: TraceSort, fallback: TraceSort | null = null) => {
    const next = effectiveSort === desc ? asc : effectiveSort === asc ? fallback : desc;
    onSortChange?.(next);
  };
  const toggleStatusSort = () => {
    const next = effectiveSort === "errorFirst" ? null : "errorFirst";
    onSortChange?.(next);
  };
  const toggleTraceSelection = (traceId: string, checked: boolean) => {
    if (!selectedTraceIds || !onSelectedTraceIdsChange) {
      return;
    }
    const next = new Set(selectedTraceIds);
    if (checked) {
      next.add(traceId);
    } else {
      next.delete(traceId);
    }
    onSelectedTraceIdsChange(next);
  };
  const toggleVisibleSelection = (checked: boolean) => {
    if (!selectedTraceIds || !onSelectedTraceIdsChange) {
      return;
    }
    const next = new Set(selectedTraceIds);
    for (const trace of result.items) {
      if (checked) {
        next.add(trace.id);
      } else {
        next.delete(trace.id);
      }
    }
    onSelectedTraceIdsChange(next);
  };

  return (
    <Table
      className={cn(selectable ? "min-w-[1220px]" : "min-w-[1180px]", className)}
      containerClassName="overflow-visible"
    >
      <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
        <TableRow>
          {selectable ? (
            <TableHead className="w-10">
              <Checkbox
                aria-label={t("traces.selectAllVisible")}
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
              />
            </TableHead>
          ) : null}
          <TableHead>{t("traces.column.service")}</TableHead>
          <TableHead>{t("traces.column.operation")}</TableHead>
          <TableHead>{t("traces.column.trace")}</TableHead>
          <SortableTableHead
            direction={sortDirection("startedAt_asc", "startedAt_desc")}
            onSort={() => togglePairSort("startedAt_asc", "startedAt_desc")}
          >
            {t("traces.column.started")}
          </SortableTableHead>
          <SortableTableHead
            direction={sortDirection("duration_asc", "duration_desc")}
            onSort={() => togglePairSort("duration_asc", "duration_desc", "startedAt_desc")}
          >
            {t("traces.column.duration")}
          </SortableTableHead>
          <SortableTableHead
            direction={effectiveSort === "errorFirst" ? "desc" : null}
            onSort={toggleStatusSort}
          >
            {t("traces.column.status")}
          </SortableTableHead>
          <TableHead>{t("traces.column.spans")}</TableHead>
          <TableHead>{t("traces.column.errorSpans")}</TableHead>
          <TableHead>{t("traces.column.logs")}</TableHead>
          <TableHead>{t("traces.column.services")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.items.map((trace) => {
          const selected = selectedTraceIds?.has(trace.id) ?? false;
          return (
            <TableRow
              className="cursor-pointer"
              data-state={selected ? "selected" : undefined}
              key={trace.id}
              onClick={() => navigate(traceHref(trace.id))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  navigate(traceHref(trace.id));
                }
              }}
              tabIndex={0}
            >
              {selectable ? (
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select trace ${trace.id}`}
                    checked={selected}
                    onCheckedChange={(checked) => toggleTraceSelection(trace.id, checked === true)}
                  />
                </TableCell>
              ) : null}
              <TableCell>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-chart-1" />
                  <span className="truncate">{trace.serviceName ?? t("value.unknown")}</span>
                </span>
              </TableCell>
              <TableCell className="max-w-72 truncate" title={traceOperation(trace)}>
                {traceOperation(trace)}
              </TableCell>
              <TableCell>
                <span className="inline-flex max-w-64 items-center gap-1.5">
                  <span className="truncate font-mono text-xs" title={trace.id}>
                    {trace.id}
                  </span>
                  <CopyButton aria-label={t("traces.copyTraceId")} value={trace.id} />
                </span>
              </TableCell>
              <TableCell title={trace.startedAt}>{formatDateTime(trace.startedAt)}</TableCell>
              <TableCell>
                <div className="flex min-w-32 items-center gap-2">
                  <span className="w-16 shrink-0 font-mono text-xs">
                    {formatDuration(trace.durationMs)}
                  </span>
                  <span className="h-1.5 min-w-12 flex-1 rounded-sm bg-muted">
                    <span
                      className="block h-full rounded-sm bg-foreground/70"
                      data-duration-bar="true"
                      style={{
                        width: `${Math.max(4, Math.min(100, ((trace.durationMs ?? 0) / maxDuration) * 100))}%`,
                      }}
                    />
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(trace.status)}>
                  {trace.status ?? t("value.unknown")}
                </Badge>
              </TableCell>
              <TableCell>{trace.spanCount}</TableCell>
              <TableCell>{trace.errorSpanCount}</TableCell>
              <TableCell>{trace.logCount}</TableCell>
              <TableCell>{trace.serviceCount}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
