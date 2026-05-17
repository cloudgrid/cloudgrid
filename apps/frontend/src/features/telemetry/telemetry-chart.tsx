import { AlertCircle } from "lucide-react";
import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const chartTokens = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export type TelemetryChartDatum = {
  label: string;
  [key: string]: number | string | null;
};

export type TelemetryChartSeries = {
  key: string;
  label: string;
  color?: string;
};

export type TelemetryChartKind =
  | "area"
  | "bar"
  | "donut"
  | "heatmap"
  | "histogram"
  | "line"
  | "pie"
  | "radar"
  | "radial";

type TelemetryChartProps = {
  data: TelemetryChartDatum[];
  series: TelemetryChartSeries[];
  summary: string;
  className?: string;
  chartClassName?: string;
  emptyMessage?: string;
  errorMessage?: string;
  kind?: TelemetryChartKind;
  loading?: boolean;
  xAxisKey?: keyof TelemetryChartDatum & string;
};

function buildChartConfig(series: TelemetryChartSeries[]) {
  return series.reduce<ChartConfig>((config, item, index) => {
    const color = item.color ?? chartTokens[index % chartTokens.length] ?? "var(--chart-1)";
    config[item.key] = {
      label: item.label,
      color,
    };
    return config;
  }, {});
}

function numericValue(value: TelemetryChartDatum[string] | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelValue(datum: TelemetryChartDatum, xAxisKey: keyof TelemetryChartDatum & string) {
  const value = datum[xAxisKey] ?? datum.label;
  return typeof value === "string" || typeof value === "number" ? String(value) : datum.label;
}

function buildRadialData(data: TelemetryChartDatum[], series: TelemetryChartSeries[]) {
  const orderedData = data.toReversed();

  return series.flatMap((item) => {
    const datum = orderedData.find((entry) => numericValue(entry[item.key]) !== null);
    const value = datum ? numericValue(datum[item.key]) : null;

    return value === null
      ? []
      : [
          {
            key: item.key,
            label: item.label,
            value,
          },
        ];
  });
}

function buildHeatmapData(
  data: TelemetryChartDatum[],
  series: TelemetryChartSeries[],
  xAxisKey: keyof TelemetryChartDatum & string,
) {
  const cells = data.flatMap((entry) =>
    series.flatMap((item) => {
      const value = numericValue(entry[item.key]);

      return value === null
        ? []
        : [
            {
              label: labelValue(entry, xAxisKey),
              magnitude: Math.abs(value),
              seriesKey: item.key,
              seriesLabel: item.label,
              size: 1,
              value,
            },
          ];
    }),
  );
  const maxMagnitude = Math.max(...cells.map((cell) => cell.magnitude), 0);

  return cells.map((cell) => ({
    ...cell,
    opacity: maxMagnitude > 0 ? 0.2 + (cell.magnitude / maxMagnitude) * 0.8 : 0.2,
  }));
}

function ChartState({
  className,
  message,
  state,
}: {
  className?: string | undefined;
  message: string;
  state: "empty" | "loading";
}) {
  if (state === "loading") {
    return (
      <div className={cn("flex h-64 min-h-64 flex-col gap-3", className)} aria-busy="true">
        <Skeleton className="h-full w-full" />
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-64 min-h-64 items-center justify-center rounded-md border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {message}
    </div>
  );
}

function ChartError({ className, message }: { className?: string | undefined; message: string }) {
  return (
    <Alert className={cn("min-h-32", className)} variant="destructive">
      <AlertCircle />
      <AlertTitle>{t("state.error.title")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function TelemetryChart({
  className,
  chartClassName,
  data,
  emptyMessage = t("state.empty.filtered.title"),
  errorMessage,
  kind = "bar",
  loading = false,
  series,
  summary,
  xAxisKey = "label",
}: TelemetryChartProps) {
  const chartConfig = useMemo(() => buildChartConfig(series), [series]);
  const heatmapData = useMemo(
    () => (kind === "heatmap" ? buildHeatmapData(data, series, xAxisKey) : []),
    [data, kind, series, xAxisKey],
  );
  const radialData = useMemo(
    () => (kind === "radial" ? buildRadialData(data, series) : []),
    [data, kind, series],
  );
  const summaryId = useId();

  if (loading) {
    return <ChartState className={chartClassName} message={t("state.loading")} state="loading" />;
  }

  if (errorMessage) {
    return <ChartError className={className} message={errorMessage} />;
  }

  if (data.length === 0 || series.length === 0) {
    return <ChartState className={chartClassName} message={emptyMessage} state="empty" />;
  }

  if (
    (kind === "heatmap" && heatmapData.length === 0) ||
    (kind === "radial" && radialData.length === 0)
  ) {
    return <ChartState className={chartClassName} message={emptyMessage} state="empty" />;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ChartContainer
        aria-describedby={summaryId}
        className={cn("h-64 min-h-64 w-full", chartClassName)}
        config={chartConfig}
      >
        {kind === "pie" || kind === "donut" ? (
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Legend content={<ChartLegendContent />} />
            <Pie
              data={data}
              dataKey={series[0]?.key ?? "value"}
              innerRadius={kind === "donut" ? 58 : 48}
              nameKey={xAxisKey}
              outerRadius={84}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell
                  fill={chartTokens[index % chartTokens.length] ?? "var(--chart-1)"}
                  key={`${entry.label}-${String(entry[series[0]?.key ?? "value"])}`}
                />
              ))}
            </Pie>
          </PieChart>
        ) : kind === "radial" ? (
          <RadialBarChart accessibilityLayer data={radialData} endAngle={-270} startAngle={90}>
            <PolarAngleAxis domain={[0, 100]} tick={false} type="number" />
            <PolarRadiusAxis axisLine={false} dataKey="label" tickLine={false} type="category" />
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Legend content={<ChartLegendContent nameKey="key" />} />
            <RadialBar background cornerRadius={4} dataKey="value">
              {radialData.map((entry) => (
                <Cell fill={`var(--color-${entry.key})`} key={entry.key} />
              ))}
            </RadialBar>
          </RadialBarChart>
        ) : kind === "radar" ? (
          <RadarChart accessibilityLayer data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey={xAxisKey} />
            <PolarRadiusAxis axisLine={false} tickLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend content={<ChartLegendContent />} />
            {series.map((item) => (
              <Radar
                dataKey={item.key}
                fill={`var(--color-${item.key})`}
                fillOpacity={0.16}
                key={item.key}
                stroke={`var(--color-${item.key})`}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        ) : kind === "heatmap" ? (
          <ScatterChart accessibilityLayer data={heatmapData}>
            <CartesianGrid vertical={false} />
            <XAxis
              allowDuplicatedCategory={false}
              axisLine={false}
              dataKey="label"
              name={String(xAxisKey)}
              tickLine={false}
              tickMargin={10}
              type="category"
            />
            <YAxis
              allowDuplicatedCategory={false}
              axisLine={false}
              dataKey="seriesLabel"
              tickLine={false}
              type="category"
              width={88}
            />
            <ZAxis dataKey="size" range={[180, 180]} />
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="seriesKey" />} />
            <Scatter dataKey="value" legendType="square" shape="square">
              {heatmapData.map((entry) => (
                <Cell
                  fill={`var(--color-${entry.seriesKey})`}
                  fillOpacity={entry.opacity}
                  key={`${entry.label}-${entry.seriesKey}`}
                />
              ))}
            </Scatter>
          </ScatterChart>
        ) : kind === "line" ? (
          <LineChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis axisLine={false} dataKey={xAxisKey} tickLine={false} tickMargin={10} />
            <YAxis axisLine={false} tickLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend content={<ChartLegendContent />} />
            {series.map((item) => (
              <Line
                dataKey={item.key}
                dot={false}
                key={item.key}
                stroke={`var(--color-${item.key})`}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </LineChart>
        ) : kind === "area" ? (
          <AreaChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis axisLine={false} dataKey={xAxisKey} tickLine={false} tickMargin={10} />
            <YAxis axisLine={false} tickLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend content={<ChartLegendContent />} />
            {series.map((item) => (
              <Area
                dataKey={item.key}
                fill={`var(--color-${item.key})`}
                fillOpacity={0.24}
                key={item.key}
                stroke={`var(--color-${item.key})`}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </AreaChart>
        ) : kind === "histogram" ? (
          <BarChart accessibilityLayer barCategoryGap={1} barGap={0} data={data}>
            <CartesianGrid vertical={false} />
            <XAxis axisLine={false} dataKey={xAxisKey} tickLine={false} tickMargin={10} />
            <YAxis axisLine={false} tickLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend content={<ChartLegendContent />} />
            {series.map((item) => (
              <Bar dataKey={item.key} fill={`var(--color-${item.key})`} key={item.key} radius={2} />
            ))}
          </BarChart>
        ) : (
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis axisLine={false} dataKey={xAxisKey} tickLine={false} tickMargin={10} />
            <YAxis axisLine={false} tickLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend content={<ChartLegendContent />} />
            {series.map((item) => (
              <Bar dataKey={item.key} fill={`var(--color-${item.key})`} key={item.key} radius={4} />
            ))}
          </BarChart>
        )}
      </ChartContainer>
      <p className="sr-only" id={summaryId}>
        {summary}
      </p>
    </div>
  );
}
