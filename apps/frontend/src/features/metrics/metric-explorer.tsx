import type {
  AttributeFilterInput,
  MetricAggregation,
  MetricChartType,
  MetricDescriptor,
  MetricExemplar,
  MetricSeries,
  MetricSeriesResult,
} from "@cloudgrid/ui-contracts";
import { Activity, ClipboardCopy, ExternalLink, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { SearchInput } from "../../components/search-input";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { TelemetryChart, type TelemetryChartKind } from "../telemetry/telemetry-chart";

export const metricAggregations: MetricAggregation[] = [
  "avg",
  "sum",
  "min",
  "max",
  "count",
  "rate",
  "p50",
  "p90",
  "p95",
  "p99",
];
export const metricChartTypes: MetricChartType[] = ["line", "area", "bar", "pie", "stat", "table"];

export type MetricInspectorTab = "descriptor" | "attributes" | "series" | "exemplars";

export function metricInspectorTabOrDefault(value: string | null): MetricInspectorTab {
  return value === "attributes" || value === "series" || value === "exemplars"
    ? value
    : "descriptor";
}

export function sanitizeMetricGroupBy(
  groupBy: string[],
  descriptor: Pick<MetricDescriptor, "attributeKeys"> | null,
): string[] {
  if (!descriptor) {
    return groupBy;
  }

  return groupBy.filter((key) => descriptor.attributeKeys.includes(key));
}

export function buildExemplarTraceHref(exemplar: Pick<MetricExemplar, "traceId" | "spanId">) {
  if (!exemplar.traceId) {
    return null;
  }

  return `/traces/${exemplar.traceId}${exemplar.spanId ? `?spanId=${exemplar.spanId}` : ""}`;
}

export function MetricList({
  metrics,
  onSelectMetric,
  selectedMetricName,
}: {
  metrics: MetricDescriptor[];
  onSelectMetric: (metricName: string) => void;
  selectedMetricName: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      {metrics.map((metric) => (
        <Button
          className={cn(
            "h-auto w-full justify-start whitespace-normal rounded-md px-3 py-2 text-left text-sm",
            selectedMetricName === metric.name && "bg-accent text-accent-foreground",
          )}
          key={metric.id}
          onClick={() => onSelectMetric(metric.name)}
          type="button"
          variant="outline"
        >
          <Activity data-icon="inline-start" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{metric.name}</span>
            {metric.description ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {metric.description}
              </span>
            ) : null}
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {metric.kind} {metric.unit ? `- ${metric.unit}` : ""} -{" "}
              {metric.aggregationTemporality ?? t("value.unknown")} - {metric.attributeKeys.length}{" "}
              {t("metrics.attributeKeys")}
            </span>
            <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
              {metric.firstSeenAt} {t("metrics.to")} {metric.lastSeenAt}
            </span>
          </span>
        </Button>
      ))}
    </div>
  );
}

export function MetricQueryControls({
  descriptor,
  onChange,
  onGroupByChange,
  state,
}: {
  descriptor: MetricDescriptor | null;
  onChange: (key: string, value: string | null) => void;
  onGroupByChange: (groupBy: string[]) => void;
  state: {
    aggregation: MetricAggregation;
    interval: string;
    groupBy: string[];
    filters: AttributeFilterInput[];
    chartType: MetricChartType;
  };
}) {
  return (
    <section className="shrink-0 border bg-background p-2">
      <FieldGroup className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Field>
          <FieldLabel htmlFor="metric-aggregation">{t("metrics.aggregation")}</FieldLabel>
          <Select
            onValueChange={(value) => onChange("aggregation", value)}
            value={state.aggregation}
          >
            <SelectTrigger id="metric-aggregation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {metricAggregations.map((aggregation) => (
                  <SelectItem key={aggregation} value={aggregation}>
                    {aggregation}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="metric-interval">{t("metrics.interval")}</FieldLabel>
          <Input
            id="metric-interval"
            onChange={(event) => onChange("interval", event.target.value)}
            value={state.interval}
          />
        </Field>
        <Field>
          <FieldLabel>{t("metrics.groupBy")}</FieldLabel>
          <DescriptorKeyPicker
            descriptor={descriptor}
            onChange={onGroupByChange}
            selected={state.groupBy}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="metric-filter-key">{t("metrics.attributeFilter")}</FieldLabel>
          <Select
            disabled={!descriptor?.attributeKeys.length}
            onValueChange={(value) => onChange("filterKey", value === "none" ? null : value)}
            value={state.filters[0]?.key ?? "none"}
          >
            <SelectTrigger id="metric-filter-key">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">{t("metrics.noFilter")}</SelectItem>
                {descriptor?.attributeKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="metric-chart-type">{t("metrics.preview")}</FieldLabel>
          <Select onValueChange={(value) => onChange("chartType", value)} value={state.chartType}>
            <SelectTrigger id="metric-chart-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {metricChartTypes.map((chartType) => (
                  <SelectItem key={chartType} value={chartType}>
                    {chartType}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </section>
  );
}

export function MetricSeriesExplorer({
  chartType,
  result,
}: {
  chartType: MetricChartType;
  result: MetricSeriesResult;
}) {
  if (result.series.length === 0) {
    return (
      <CenteredMessage
        title={t("metrics.empty.noSeries.title")}
        description={t("metrics.empty.noSeries.description")}
      />
    );
  }
  const chart = buildMetricExplorerChartData(result, chartType);

  return (
    <div className="flex min-w-[760px] flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background p-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{result.metric.name}</h2>
          <p className="text-xs text-muted-foreground">
            {result.aggregation} every {result.interval ?? "default interval"} as {chartType}
          </p>
        </div>
        <Badge variant="outline">
          {result.series.length} {t("metrics.series")}
        </Badge>
      </div>
      {result.warnings.length > 0 ? (
        <div className="border-b p-3">
          {result.warnings.map((warning) => (
            <Alert key={`${warning.code}:${warning.field ?? ""}`}>
              <AlertTitle>{warning.code}</AlertTitle>
              <AlertDescription>{warning.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}
      {chartType === "table" ? null : (
        <div className="border-b p-3">
          {chartType === "stat" ? (
            <MetricStat result={result} />
          ) : (
            <TelemetryChart
              chartClassName="h-72 min-h-72"
              data={chart.data}
              emptyMessage={t("metrics.empty.noSeries.title")}
              kind={chart.kind}
              series={chart.series}
              summary={`${result.metric.name} ${chartType} chart with ${result.series.length} ${t(
                "metrics.series",
              )}.`}
            />
          )}
        </div>
      )}
      <div className="divide-y">
        {result.series.slice(0, 20).map((series) => (
          <MetricSeriesRows key={metricSeriesKey(series)} series={series} />
        ))}
      </div>
    </div>
  );
}

export function MetricInspector({
  descriptor,
  groupBy,
  onGroupByChange,
  onTabChange,
  result,
  tab,
}: {
  descriptor: MetricDescriptor | null;
  groupBy: string[];
  onGroupByChange: (groupBy: string[]) => void;
  onTabChange: (tab: MetricInspectorTab) => void;
  result: MetricSeriesResult | null;
  tab: MetricInspectorTab;
}) {
  return (
    <aside className="min-h-0 overflow-hidden border-l bg-background pl-3">
      <Tabs
        className="h-full gap-0"
        onValueChange={(value) => onTabChange(value as MetricInspectorTab)}
        value={tab}
      >
        <div className="shrink-0 border-b py-2 pr-3">
          <TabsList className="w-full" variant="line">
            <TabsTrigger value="descriptor">{t("metrics.inspector.descriptor")}</TabsTrigger>
            <TabsTrigger value="attributes">{t("metrics.inspector.attributes")}</TabsTrigger>
            <TabsTrigger value="series">{t("metrics.inspector.series")}</TabsTrigger>
            <TabsTrigger value="exemplars">{t("metrics.inspector.exemplars")}</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-3 pr-3">
          <TabsContent className="m-0" value="descriptor">
            <DescriptorTab descriptor={descriptor} />
          </TabsContent>
          <TabsContent className="m-0" value="attributes">
            <AttributesTab
              descriptor={descriptor}
              groupBy={groupBy}
              onGroupByChange={onGroupByChange}
            />
          </TabsContent>
          <TabsContent className="m-0" value="series">
            <SeriesTab result={result} />
          </TabsContent>
          <TabsContent className="m-0" value="exemplars">
            <ExemplarsTab result={result} />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

export function CenteredMessage({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-1 p-8 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function MetricExplorerEmpty({
  filtered,
  href,
  onClear,
}: {
  filtered: boolean;
  href: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      <p>{filtered ? t("metrics.empty.noMatch") : t("metrics.empty.noMetrics")}</p>
      {filtered ? (
        <Button className="mt-2" onClick={onClear} size="sm" type="button" variant="ghost">
          <X data-icon="inline-start" />
          {t("metrics.empty.clearSearch")}
        </Button>
      ) : (
        <Button asChild className="mt-2" size="sm" variant="outline">
          <Link to={href}>
            <ClipboardCopy data-icon="inline-start" />
            {t("metrics.empty.openSetup")}
          </Link>
        </Button>
      )}
    </div>
  );
}

export function MetricSearchField({
  metricSearch,
  onChange,
}: {
  metricSearch: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="metric-search">{t("metrics.search.label")}</FieldLabel>
      <SearchInput
        id="metric-search"
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("metrics.search.placeholder")}
        value={metricSearch}
      />
    </Field>
  );
}

function DescriptorKeyPicker({
  descriptor,
  onChange,
  selected,
}: {
  descriptor: MetricDescriptor | null;
  onChange: (groupBy: string[]) => void;
  selected: string[];
}) {
  const selectValue = selected[0] ?? "none";
  if (!descriptor?.attributeKeys.length) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {t("metrics.noDescriptorKeys")}
      </p>
    );
  }

  return (
    <Select
      onValueChange={(value) => onChange(value === "none" ? [] : [value])}
      value={selectValue}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("value.none")}</SelectItem>
        {descriptor.attributeKeys.map((key) => (
          <SelectItem key={key} value={key}>
            {key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricSeriesRows({ series }: { series: MetricSeries }) {
  return (
    <section className="p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <code className="truncate text-xs">{JSON.stringify(series.labels)}</code>
        <Badge variant="secondary">
          {series.points.length} {t("metrics.series.points")}
        </Badge>
      </div>
      <div className="grid grid-cols-[minmax(220px,1fr)_120px_120px] gap-2 text-xs">
        <div className="font-medium text-muted-foreground">{t("metrics.series.timestamp")}</div>
        <div className="font-medium text-muted-foreground">{t("metrics.series.value")}</div>
        <div className="font-medium text-muted-foreground">{t("metrics.series.exemplars")}</div>
        {series.points.slice(0, 80).map((point) => (
          <div className="contents" key={`${point.timestamp}:${point.value}`}>
            <code>{point.timestamp}</code>
            <code>{point.value}</code>
            <span className="flex flex-wrap gap-1">
              {point.exemplars.map((exemplar) => {
                const href = buildExemplarTraceHref(exemplar);
                return href ? (
                  <Button
                    asChild
                    key={`${point.timestamp}:${exemplar.traceId}:${exemplar.spanId ?? ""}`}
                    size="sm"
                    variant="ghost"
                  >
                    <Link to={href}>
                      <ExternalLink data-icon="inline-start" />
                      {t("metrics.trace")}
                    </Link>
                  </Button>
                ) : null;
              })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricStat({ result }: { result: MetricSeriesResult }) {
  const latest = result.series
    .flatMap((series) => series.points)
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp))
    .at(-1);

  return (
    <div className="flex h-72 min-h-72 flex-col justify-center gap-2">
      <span className="text-sm text-muted-foreground">{result.metric.name}</span>
      <span className="text-4xl font-semibold tabular-nums">
        {latest ? latest.value.toLocaleString() : t("value.none")}
      </span>
      <span className="text-xs text-muted-foreground">
        {latest?.timestamp ?? result.metric.lastSeenAt}
      </span>
    </div>
  );
}

function buildMetricExplorerChartData(result: MetricSeriesResult, chartType: MetricChartType) {
  if (chartType === "pie") {
    return {
      kind: "pie" as TelemetryChartKind,
      data: result.series.map((series) => ({
        label: metricSeriesLabel(series.labels),
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
    label: metricSeriesLabel(metricSeries.labels),
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
    kind:
      chartType === "area"
        ? ("area" as const)
        : chartType === "bar"
          ? ("bar" as const)
          : ("line" as const),
    data,
    series,
  };
}

function metricSeriesLabel(labels: MetricSeries["labels"]) {
  if (!labels || (typeof labels === "object" && Object.keys(labels).length === 0)) {
    return t("value.all");
  }
  return JSON.stringify(labels);
}

function DescriptorTab({ descriptor }: { descriptor: MetricDescriptor | null }) {
  if (!descriptor) {
    return <p className="text-sm text-muted-foreground">{t("metrics.selectDescriptor")}</p>;
  }

  return (
    <dl className="grid gap-2 text-sm">
      <InspectorRow label={t("metrics.descriptor.name")}>{descriptor.name}</InspectorRow>
      <InspectorRow label={t("metrics.descriptor.description")}>
        {descriptor.description ?? t("value.none")}
      </InspectorRow>
      <InspectorRow label={t("metrics.descriptor.kind")}>{descriptor.kind}</InspectorRow>
      <InspectorRow label={t("metrics.descriptor.unit")}>{descriptor.unit}</InspectorRow>
      <InspectorRow label={t("metrics.descriptor.temporality")}>
        {descriptor.aggregationTemporality ?? t("value.unknown")}
      </InspectorRow>
      <InspectorRow label={t("metrics.descriptor.monotonic")}>
        {descriptor.monotonic === null || descriptor.monotonic === undefined
          ? t("value.unknown")
          : String(descriptor.monotonic)}
      </InspectorRow>
      <InspectorRow label={t("metrics.descriptor.firstSeen")}>
        {descriptor.firstSeenAt}
      </InspectorRow>
      <InspectorRow label={t("metrics.descriptor.lastSeen")}>{descriptor.lastSeenAt}</InspectorRow>
    </dl>
  );
}

function AttributesTab({
  descriptor,
  groupBy,
  onGroupByChange,
}: {
  descriptor: MetricDescriptor | null;
  groupBy: string[];
  onGroupByChange: (groupBy: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const keys =
    descriptor?.attributeKeys.filter((key) => key.toLowerCase().includes(query.toLowerCase())) ??
    [];

  return (
    <section className="flex flex-col gap-3">
      <SearchInput
        aria-label={t("metrics.searchDescriptorAttributes")}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("metrics.searchDescriptorAttributes")}
        value={query}
      />
      {groupBy.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {groupBy.map((key) => (
            <Button
              key={key}
              onClick={() => onGroupByChange(groupBy.filter((item) => item !== key))}
              size="sm"
              type="button"
              variant="secondary"
            >
              {key}
              <X data-icon="inline-end" />
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {keys.length ? (
          keys.map((key) => (
            <Badge key={key} variant={groupBy.includes(key) ? "default" : "outline"}>
              {key}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t("metrics.noDescriptorAttributeKeys")}</p>
        )}
      </div>
    </section>
  );
}

function SeriesTab({ result }: { result: MetricSeriesResult | null }) {
  if (!result) {
    return <p className="text-sm text-muted-foreground">{t("metrics.runQueryForSeries")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-2 text-sm">
        <InspectorRow label={t("metrics.inspector.series")}>{result.series.length}</InspectorRow>
        <InspectorRow label={t("metrics.descriptor.warnings")}>
          {result.warnings.length}
        </InspectorRow>
        <InspectorRow label={t("metrics.groupBy")}>
          {result.groupBy.join(", ") || t("value.none")}
        </InspectorRow>
      </dl>
      <div className="divide-y rounded-md border">
        {result.series.slice(0, 20).map((series) => (
          <div className="px-2 py-1.5 text-xs" key={metricSeriesKey(series)}>
            <code className="block truncate">{JSON.stringify(series.labels)}</code>
            <span className="text-muted-foreground">
              {series.points.length} points
              {series.points[0] ? `, first ${series.points[0].timestamp}` : ""}
              {series.points.at(-1) ? `, latest ${series.points.at(-1)?.timestamp}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExemplarsTab({ result }: { result: MetricSeriesResult | null }) {
  const exemplars =
    result?.series.flatMap((series) =>
      series.points.flatMap((point) =>
        point.exemplars.map((exemplar) => ({
          labels: series.labels,
          pointTimestamp: point.timestamp,
          exemplar,
        })),
      ),
    ) ?? [];

  if (!result) {
    return <p className="text-sm text-muted-foreground">{t("metrics.runQueryForExemplars")}</p>;
  }

  if (exemplars.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("metrics.noExemplars")}</p>;
  }

  return (
    <div className="divide-y rounded-md border">
      {exemplars.map(({ exemplar, labels, pointTimestamp }) => {
        const href = buildExemplarTraceHref(exemplar);
        return (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-2 py-1.5 text-xs"
            key={`${pointTimestamp}:${exemplar.timestamp}:${exemplar.traceId ?? ""}`}
          >
            <div className="min-w-0">
              <code className="block truncate">{exemplar.timestamp}</code>
              <span className="block text-muted-foreground">value {exemplar.value}</span>
              <code className="block truncate text-muted-foreground">
                {JSON.stringify(labels)} {JSON.stringify(exemplar.attributes)}
              </code>
              {exemplar.traceId ? (
                <code className="block truncate text-muted-foreground">
                  {exemplar.traceId}
                  {exemplar.spanId ? ` / ${exemplar.spanId}` : ""}
                </code>
              ) : null}
            </div>
            {href ? (
              <Button asChild size="sm" variant="ghost">
                <Link to={href}>
                  <ExternalLink data-icon="inline-start" />
                  {t("metrics.trace")}
                </Link>
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function InspectorRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function metricSeriesKey(series: MetricSeries): string {
  const first = series.points[0]?.timestamp ?? "empty";
  const last = series.points.at(-1)?.timestamp ?? first;
  return `${JSON.stringify(series.labels)}:${first}:${last}:${series.points.length}`;
}
