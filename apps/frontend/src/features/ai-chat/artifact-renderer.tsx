import type {
  LogEvent,
  MetricChartType,
  MetricSeriesResult,
  TraceDetail,
} from "@cloudgrid/ui-contracts";
import { useMemo, useState } from "react";
import { CodeBlock } from "../../components/code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { t } from "../../lib/i18n";
import { MetricSeriesExplorer } from "../metrics/metric-explorer";
import { TelemetryChart, type TelemetryChartDatum } from "../telemetry/telemetry-chart";
import { TraceTreeWaterfall } from "../traces/trace-tree-waterfall";
import type { ApprovedAiChatRenderer } from "./view-model";

export function AiChatArtifactRenderer({
  content,
  renderer,
}: {
  content: Record<string, unknown>;
  renderer: ApprovedAiChatRenderer;
}) {
  if (renderer === "metric_timeseries" || renderer === "metric_bar") {
    const result = metricSeriesResultFromContent(content);
    if (result) {
      return (
        <MetricSeriesExplorer
          chartType={renderer === "metric_bar" ? "bar" : chartTypeFromContent(content)}
          result={result}
        />
      );
    }
  }

  if (renderer === "table" && Array.isArray(content.rows)) {
    return <JsonTable rows={content.rows} />;
  }

  if (renderer === "key_value" || renderer === "status_summary") {
    return (
      <div className="grid gap-3">
        <KeyValueSummary content={content} />
        {Array.isArray(content.rows) ? <JsonTable rows={content.rows} /> : null}
      </div>
    );
  }

  if (renderer === "log_list" && Array.isArray(content.items)) {
    return <JsonTable rows={content.items} />;
  }

  if (renderer === "trace_waterfall") {
    const detail = traceDetailFromContent(content);
    if (detail) {
      return <TraceWaterfallArtifact detail={detail} />;
    }
  }

  if (renderer === "json_tree") {
    return <JsonBlock content={content} />;
  }

  if (renderer === "metric_bar" && Array.isArray(content.data)) {
    return (
      <TelemetryChart
        chartClassName="h-72 min-h-72"
        data={chartDataFromContent(content)}
        emptyMessage={t("metrics.empty.noSeries.title")}
        kind="bar"
        series={chartSeriesFromContent(content)}
        summary={stringValue(content.summary) ?? "CloudGrid metric artifact chart."}
      />
    );
  }

  return <JsonBlock content={content} />;
}

function TraceWaterfallArtifact({ detail }: { detail: TraceDetail }) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(
    detail.selectedSpan?.id ?? detail.trace.rootSpanId ?? detail.spans[0]?.id ?? null,
  );
  const matchedSpanIds = useMemo(
    () => detail.spanMatches.map((match) => match.spanId),
    [detail.spanMatches],
  );
  const exactLogSpanIds = useMemo(() => logSpanIds(detail.relatedLogs), [detail.relatedLogs]);

  return (
    <div className="h-[440px] min-h-80 overflow-hidden rounded-md border">
      <TraceTreeWaterfall
        ariaLabel="Trace tree waterfall"
        className="h-full"
        compact
        criticalPathSpanIds={detail.structure.criticalPathSpanIds}
        exactLogSpanIds={exactLogSpanIds}
        filterVisibleSpanIds={detail.spans.map((span) => span.id)}
        headerActions={null}
        matchedSpanIds={matchedSpanIds}
        onCollapseSelectedDescendant={setSelectedSpanId}
        onSelectSpanId={setSelectedSpanId}
        orphanSpanIds={detail.structure.orphanSpanIds}
        rootSpanIds={detail.structure.rootSpanIds}
        selectedSpanId={selectedSpanId}
        spans={detail.spans}
        traceDurationNano={detail.trace.durationNano ?? null}
        traceDurationMs={detail.trace.durationMs ?? null}
        traceStartedAt={detail.trace.startedAt}
        traceStartedAtUnixNano={detail.trace.startedAtUnixNano}
      />
    </div>
  );
}

function JsonTable({ rows: rawRows }: { rows: unknown[] }) {
  const rows = rawRows.filter(isRecord).slice(0, 10);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6);
  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex.toString()}>
              {columns.map((column) => (
                <TableCell key={column}>{stringifyJsonValue(row[column])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KeyValueSummary({ content }: { content: Record<string, unknown> }) {
  const entries = Object.entries(
    content.values && isRecord(content.values) ? content.values : content,
  )
    .filter(([key]) => key !== "renderer")
    .slice(0, 20);
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div className="rounded-md border bg-muted/20 p-2" key={key}>
          <dt className="text-xs text-muted-foreground">{key}</dt>
          <dd className="mt-1 font-medium">{stringifyJsonValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function JsonBlock({ content }: { content: Record<string, unknown> }) {
  return (
    <CodeBlock
      code={JSON.stringify(content, null, 2)}
      language="json"
      maxHeightClassName="max-h-80"
    />
  );
}

function metricSeriesResultFromContent(content: Record<string, unknown>) {
  const candidate = isRecord(content.result) ? content.result : content;
  if (!isRecord(candidate.metric) || !Array.isArray(candidate.series)) {
    return null;
  }
  return candidate as unknown as MetricSeriesResult;
}

function traceDetailFromContent(content: Record<string, unknown>) {
  const candidate = isRecord(content.data) ? content.data : null;
  if (
    !candidate ||
    !isTraceRecord(candidate.trace) ||
    !Array.isArray(candidate.spans) ||
    !candidate.spans.every(isSpanRecord) ||
    !isTraceStructureRecord(candidate.structure)
  ) {
    return null;
  }

  return {
    trace: candidate.trace,
    structure: candidate.structure,
    spans: candidate.spans,
    selectedSpan: isRecord(candidate.selectedSpan) ? candidate.selectedSpan : null,
    spanMatches: Array.isArray(candidate.spanMatches) ? candidate.spanMatches : [],
    logs: Array.isArray(candidate.logs) ? candidate.logs : [],
    relatedLogs: Array.isArray(candidate.relatedLogs) ? candidate.relatedLogs : [],
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings : [],
  } as unknown as TraceDetail;
}

function isTraceRecord(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.startedAtUnixNano === "string" &&
    isRecord(value.attributes)
  );
}

function isTraceStructureRecord(value: unknown) {
  return (
    isRecord(value) &&
    Array.isArray(value.rootSpanIds) &&
    value.rootSpanIds.every(isString) &&
    Array.isArray(value.orphanSpanIds) &&
    value.orphanSpanIds.every(isString) &&
    Array.isArray(value.criticalPathSpanIds) &&
    value.criticalPathSpanIds.every(isString)
  );
}

function isSpanRecord(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.traceId === "string" &&
    (typeof value.parentSpanId === "string" ||
      value.parentSpanId === null ||
      value.parentSpanId === undefined) &&
    typeof value.name === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.startedAtUnixNano === "string" &&
    typeof value.endedAt === "string" &&
    typeof value.endedAtUnixNano === "string" &&
    typeof value.startOffsetNano === "string" &&
    typeof value.durationNano === "string" &&
    typeof value.durationMs === "number" &&
    isRecord(value.attributes) &&
    typeof value.depth === "number" &&
    typeof value.childCount === "number" &&
    typeof value.hasError === "boolean" &&
    typeof value.isCriticalPath === "boolean" &&
    typeof value.isOrphan === "boolean" &&
    typeof value.isServiceEntry === "boolean" &&
    typeof value.exceptionCount === "number" &&
    Array.isArray(value.events) &&
    Array.isArray(value.links) &&
    Array.isArray(value.exceptions)
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function logSpanIds(logs: LogEvent[]) {
  return Array.from(
    new Set(
      logs.flatMap((log) => {
        if (!log.spanId) {
          return [];
        }
        return [log.spanId];
      }),
    ),
  );
}

function chartTypeFromContent(content: Record<string, unknown>): MetricChartType {
  const chartType = stringValue(content.chartType);
  return chartType === "area" || chartType === "bar" || chartType === "pie" || chartType === "stat"
    ? chartType
    : "line";
}

function chartSeriesFromContent(content: Record<string, unknown>) {
  if (!Array.isArray(content.series)) {
    return [{ key: "value", label: stringValue(content.label) ?? "Value" }];
  }
  return content.series.filter(isRecord).flatMap((series) => {
    const key = stringValue(series.key);
    if (!key) {
      return [];
    }
    return [{ key, label: stringValue(series.label) ?? key }];
  });
}

function chartDataFromContent(content: Record<string, unknown>): TelemetryChartDatum[] {
  if (!Array.isArray(content.data)) {
    return [];
  }
  return content.data.filter(isRecord).flatMap((row) => {
    const label = stringValue(row.label);
    if (!label) {
      return [];
    }
    const next: TelemetryChartDatum = { label };
    for (const [key, value] of Object.entries(row)) {
      if (key === "label") {
        continue;
      }
      if (typeof value === "number" || typeof value === "string" || value === null) {
        next[key] = value;
      }
    }
    return [next];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringifyJsonValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
