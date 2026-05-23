import type { MetricChartType } from "@cloudgrid/ui-contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { TelemetryChart } from "../../telemetry/telemetry-chart";
import { t } from "../../../lib/i18n";
import { normalizeChartKind } from "./metric-widget-renderer";

type RichMetricPoint = { timestamp: string; value: number };
type RichMetricSeries = {
  id: string;
  sourceId: string;
  label: string;
  points: RichMetricPoint[];
};
type RichMetricDisplaySeries = {
  id: string;
  sourceId: string;
  label: string;
  visible?: boolean | null;
};

type RichMetricSeriesResult = {
  interval: string;
  series: RichMetricSeries[];
  displaySeries: RichMetricDisplaySeries[];
};

export function RichMetricWidgetPreview({
  result,
  visualization,
}: {
  result: RichMetricSeriesResult;
  visualization: MetricChartType;
}) {
  const visibleIds = new Set(
    result.displaySeries.filter((series) => series.visible).map((series) => series.sourceId),
  );
  const visibleSeries = visibleIds.size
    ? result.series.filter((series) => visibleIds.has(series.id) || visibleIds.has(series.sourceId))
    : result.series;

  if (visibleSeries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboards.metric.noSeries")}</p>;
  }

  if (visualization === "stat" || visualization === "radial") {
    const latest = visibleSeries
      .flatMap((series) => series.points.map((point) => ({ ...point, label: series.label })))
      .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp))
      .at(-1);
    return (
      <div className="flex h-full min-h-40 flex-col justify-center gap-2">
        <span className="text-sm text-muted-foreground">{latest?.label ?? t("value.none")}</span>
        <span className="text-3xl font-semibold tabular-nums">
          {latest ? latest.value.toLocaleString() : t("value.none")}
        </span>
        <span className="text-xs text-muted-foreground">
          {latest?.timestamp ?? result.interval}
        </span>
      </div>
    );
  }

  if (visualization === "table") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display series</TableHead>
            <TableHead>{t("metrics.series.timestamp")}</TableHead>
            <TableHead>{t("metrics.series.value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleSeries.slice(0, 12).map((series) => {
            const point = series.points.at(-1);
            return (
              <TableRow key={series.id}>
                <TableCell className="max-w-48 truncate text-xs">{series.label}</TableCell>
                <TableCell>{point?.timestamp ?? t("value.none")}</TableCell>
                <TableCell className="font-mono">{point?.value ?? t("value.none")}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const chart = buildRichMetricChartData(visibleSeries, visualization);
  return (
    <TelemetryChart
      chartClassName="h-60 min-h-60"
      data={chart.data}
      emptyMessage={t("dashboards.metric.noSeries")}
      kind={chart.kind}
      series={chart.series}
      summary={`Rich metric ${visualization} chart with ${visibleSeries.length} ${t(
        "dashboards.metric.series",
      )}.`}
    />
  );
}

export function buildRichMetricChartData(
  richSeries: RichMetricSeries[],
  visualization: MetricChartType,
) {
  if (visualization === "pie" || visualization === "donut" || visualization === "radar") {
    return {
      kind: "pie" as const,
      data: richSeries.slice(0, 12).map((series) => ({
        label: series.label,
        value: series.points.at(-1)?.value ?? 0,
      })),
      series: [{ key: "value", label: t("metrics.series.value") }],
    };
  }
  const timestamps = Array.from(
    new Set(richSeries.flatMap((series) => series.points.map((point) => point.timestamp))),
  ).sort();
  const series = richSeries.slice(0, 20).map((metricSeries) => ({
    key: metricSeries.id,
    label: metricSeries.label,
  }));
  const data = timestamps.map((timestamp) => {
    const row: Record<string, number | string | null> = { label: timestamp };
    richSeries.slice(0, 20).forEach((metricSeries) => {
      row[metricSeries.id] =
        metricSeries.points.find((point) => point.timestamp === timestamp)?.value ?? null;
    });
    return row as { label: string } & Record<string, number | string | null>;
  });
  return { kind: normalizeChartKind(visualization), data, series };
}
