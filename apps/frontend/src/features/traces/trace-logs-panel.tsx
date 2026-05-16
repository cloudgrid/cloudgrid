import type { LogEvent } from "@cloudgrid/ui-contracts";
import { Filter, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { CodeBlock } from "../../components/code-block";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  SortableTableHead,
  type TableSortDirection,
} from "../../components/ui/table";
import { formatDateTime, jsonPreview } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { AttributeEvidenceBrowser, jsonValueToCopyText } from "./attribute-browser";
import { type LogsMode, type RelatedLogsSortKey, compareRelatedLogs } from "./trace-detail-types";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function LogDetailDialog({
  log,
  onOpenChange,
}: {
  log: LogEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("traceDetail.logDetails")}</DialogTitle>
          <DialogDescription>{log?.id}</DialogDescription>
        </DialogHeader>
        {log ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
              <Metric label={t("logs.column.timestamp")} value={formatDateTime(log.timestamp)} />
              <Metric
                label={t("logs.column.severity")}
                value={log.severityText ?? t("value.unknown")}
              />
              <Metric
                label={t("logs.column.service")}
                value={log.serviceName ?? t("value.unknown")}
              />
              <Metric label={t("filters.traceId")} value={log.traceId ?? t("value.unknown")} />
              <Metric label={t("filters.spanId")} value={log.spanId ?? t("value.unknown")} />
              <Metric
                label={t("traceDetail.observed")}
                value={
                  log.observedTimestamp ? formatDateTime(log.observedTimestamp) : t("value.unknown")
                }
              />
            </div>
            <CodeBlock
              code={jsonValueToCopyText(log.body)}
              language="json"
              maxHeightClassName="max-h-56"
              title={t("traceDetail.body")}
            />
            <AttributeEvidenceBrowser attributes={log.attributes} search="" setSearch={() => {}} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RelatedLogsTable({
  logs,
  onSelectLog,
}: {
  logs: LogEvent[];
  onSelectLog: (log: LogEvent) => void;
}) {
  const [sort, setSort] = useState<{
    key: RelatedLogsSortKey;
    direction: Exclude<TableSortDirection, null>;
  }>({
    key: "timestamp",
    direction: "asc",
  });
  const sortedLogs = useMemo(
    () =>
      [...logs].sort((left, right) => {
        const result = compareRelatedLogs(left, right, sort.key);
        return sort.direction === "asc" ? result : -result;
      }),
    [logs, sort],
  );
  const toggleSort = (key: RelatedLogsSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };
  const directionFor = (key: RelatedLogsSortKey): TableSortDirection =>
    sort.key === key ? sort.direction : null;

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("traceDetail.noItems")}</p>;
  }

  return (
    <Table containerClassName="max-h-full overflow-auto">
      <TableHeader>
        <TableRow>
          <SortableTableHead
            direction={directionFor("timestamp")}
            onSort={() => toggleSort("timestamp")}
          >
            {t("logs.column.timestamp")}
          </SortableTableHead>
          <SortableTableHead
            direction={directionFor("severity")}
            onSort={() => toggleSort("severity")}
          >
            {t("logs.column.severity")}
          </SortableTableHead>
          <SortableTableHead
            direction={directionFor("service")}
            onSort={() => toggleSort("service")}
          >
            {t("logs.column.service")}
          </SortableTableHead>
          <SortableTableHead direction={directionFor("span")} onSort={() => toggleSort("span")}>
            Span
          </SortableTableHead>
          <SortableTableHead direction={directionFor("body")} onSort={() => toggleSort("body")}>
            {t("logs.column.body")}
          </SortableTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedLogs.map((log) => (
          <TableRow
            className="cursor-pointer"
            key={log.id}
            onClick={() => onSelectLog(log)}
            tabIndex={0}
          >
            <TableCell className="whitespace-nowrap font-mono text-xs">
              {formatDateTime(log.timestamp)}
            </TableCell>
            <TableCell>
              <span
                className={cn("text-xs", log.severityText === "ERROR" && "font-medium text-error")}
              >
                {log.severityText ?? t("value.unknown")}
              </span>
            </TableCell>
            <TableCell className="max-w-40 truncate">
              {log.serviceName ?? t("value.unknown")}
            </TableCell>
            <TableCell className="max-w-36 truncate font-mono text-xs">
              {log.spanId ?? t("value.unknown")}
            </TableCell>
            <TableCell className="max-w-[420px] truncate font-mono text-xs">
              {jsonPreview(log.body)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TraceLogsPanel({
  logs,
  mode,
  setMode,
}: {
  logs: LogEvent[];
  mode: LogsMode;
  setMode: (mode: LogsMode) => void;
}) {
  const [selectedLog, setSelectedLog] = useState<LogEvent | null>(null);
  return (
    <section className="flex min-h-40 flex-1 flex-col overflow-hidden border bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">{t("traceDetail.logs")}</h2>
          <p className="text-xs text-muted-foreground">{logs.length} rows</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-1">
          <Button
            onClick={() => setMode("selected")}
            size="sm"
            type="button"
            variant={mode === "selected" ? "secondary" : "ghost"}
          >
            <Filter data-icon="inline-start" />
            Selected span
          </Button>
          <Button
            onClick={() => setMode("trace")}
            size="sm"
            type="button"
            variant={mode === "trace" ? "secondary" : "ghost"}
          >
            <ScrollText data-icon="inline-start" />
            Whole trace
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <RelatedLogsTable logs={logs} onSelectLog={setSelectedLog} />
      </div>
      <LogDetailDialog log={selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)} />
    </section>
  );
}
