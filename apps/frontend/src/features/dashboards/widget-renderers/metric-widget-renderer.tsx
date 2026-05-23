import type { JSONValue, MetricChartType } from "@cloudgrid/ui-contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { TelemetryChart, type TelemetryChartKind } from "../../telemetry/telemetry-chart";
import { t } from "../../../lib/i18n";
import { jsonPreview } from "../../../lib/format";

type MetricSeriesResult = {
  metric: { name: string; lastSeenAt: string };
  series: Array<{
    labels: JSONValue;
    points: Array<{ timestamp: string; value: number }>;
  }>;
};

export function MetricWidgetPreview({
  result,
  visualization,
}: {
  result: MetricSeriesResult;
  visualization: MetricChartType;
}) {
  if (result.series.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboards.metric.noSeries")}</p>;
  }

  if (visualization === "stat") {
    const latest = latestMetricPoint(result);
    return (
      <div className="flex h-full min-h-40 flex-col justify-center gap-2">
        <span className="text-sm text-muted-foreground">{result.metric.name}</span>
        <span className="text-3xl font-semibold tabular-nums">
          {latest ? latest.value.toLocaleString() : t("value.none")}
        </span>
        <span className="text-xs text-muted-foreground">
          {latest?.timestamp ?? result.metric.lastSeenAt}
        </span>
      </div>
    );
  }

  if (visualization === "table") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("metrics.groupBy")}</TableHead>
            <TableHead>{t("metrics.series.timestamp")}</TableHead>
            <TableHead>{t("metrics.series.value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.series.slice(0, 8).map((series) => {
            const point = series.points.at(-1);
            return (
              <TableRow key={JSON.stringify(series.labels)}>
                <TableCell className="max-w-48 truncate font-mono text-xs">
                  {seriesLabel(series.labels)}
                </TableCell>
                <TableCell>{point?.timestamp ?? t("value.none")}</TableCell>
                <TableCell className="font-mono">{point?.value ?? t("value.none")}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const chart = buildMetricChartData(result, visualization);

  return (
    <TelemetryChart
      chartClassName="h-60 min-h-60"
      data={chart.data}
      emptyMessage={t("dashboards.metric.noSeries")}
      kind={chart.kind}
      series={chart.series}
      summary={`${result.metric.name} ${visualization} chart with ${result.series.length} ${t(
        "dashboards.metric.series",
      )}.`}
    />
  );
}

export function buildMetricChartData(result: MetricSeriesResult, visualization: MetricChartType) {
  if (visualization === "pie" || visualization === "donut" || visualization === "radar") {
    return {
      kind: "pie" as TelemetryChartKind,
      data: result.series.map((series) => ({
        label: seriesLabel(series.labels),
        value: series.points.at(-1)?.value ?? 0,
      })),
      series: [{ key: "value", label: result.metric.name }],
    };
  }

  const timestamps = Array.from(
    new Set(result.series.flatMap((series) => series.points.map((point) => point.timestamp))),
  ).sort();
  const series = result.series.slice(0, 8).map((metricSeries, index) => ({
    key: `series_${index}`,
    label: seriesLabel(metricSeries.labels),
  }));
  const data = timestamps.map((timestamp) => {
    const row: Record<string, number | string | null> = { label: timestamp };
    result.series.slice(0, 8).forEach((metricSeries, index) => {
      row[`series_${index}`] =
        metricSeries.points.find((point) => point.timestamp === timestamp)?.value ?? null;
    });
    return row as { label: string } & Record<string, number | string | null>;
  });

  return {
    kind: normalizeChartKind(visualization),
    data,
    series,
  };
}

export function seriesLabel(labels: JSONValue): string {
  if (!labels || (typeof labels === "object" && Object.keys(labels).length === 0)) {
    return t("value.all");
  }
  if (typeof labels === "object" && !Array.isArray(labels)) {
    const entries = Object.entries(labels);
    if (entries.length === 1) {
      return String(entries[0]?.[1] ?? t("value.none"));
    }
    return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
  }
  return jsonPreview(labels);
}

function latestMetricPoint(result: MetricSeriesResult) {
  return result.series
    .flatMap((series) => series.points)
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp))
    .at(-1);
}

export function normalizeChartKind(visualization: MetricChartType): TelemetryChartKind {
  if (visualization === "area") {
    return "area";
  }
  if (visualization === "bar" || visualization === "heatmap" || visualization === "histogram") {
    return "bar";
  }
  if (visualization === "pie" || visualization === "donut" || visualization === "radar") {
    return "pie";
  }
  return "line";
}
