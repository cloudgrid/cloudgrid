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
  XAxis,
  YAxis,
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

export type TelemetryChartKind = "area" | "bar" | "line" | "pie";

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

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ChartContainer
        aria-describedby={summaryId}
        className={cn("h-64 min-h-64 w-full", chartClassName)}
        config={chartConfig}
      >
        {kind === "pie" ? (
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Legend content={<ChartLegendContent />} />
            <Pie
              data={data}
              dataKey={series[0]?.key ?? "value"}
              innerRadius={48}
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
