import type { ReactNode } from "react";
import type { AlertEvent, AlertSummary } from "@cloudgrid/ui-contracts";
import { Badge } from "../../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { t } from "../../../lib/i18n";
import { formatDateTime } from "../../../lib/format";

export function AlertStatusWidgetPreview({ summary }: { summary: AlertSummary }) {
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

export function AlertHistoryWidgetPreview({ events }: { events: AlertEvent[] }) {
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

export function AlertEvidenceWidgetPreview({ event }: { event: AlertEvent | null }) {
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

function SummaryRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
