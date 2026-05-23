import type { MetricAggregation } from "@cloudgrid/ui-contracts";
import { METRIC_AGGREGATIONS } from "@cloudgrid/ui-contracts";
import { Field, FieldGroup, FieldLabel } from "../../../components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import type { DashboardWidgetInput } from "../../../lib/dashboard-contracts";
import { t } from "../../../lib/i18n";
import { MetricNameCombobox } from "../../metrics/metric-query-controls";
import type { useTelemetryClient } from "../../../providers/telemetry-client-provider";

const metricAggregations: MetricAggregation[] = [...METRIC_AGGREGATIONS];

export function updateMetricWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["metric"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.metric) return;
  onWidgetChange({ ...widget, metric: { ...widget.metric, ...patch } });
}

export function MetricWidgetEditor({
  disabled,
  onWidgetChange,
  range,
  telemetryClient,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  widget: DashboardWidgetInput;
}) {
  if (!widget.metric) return null;

  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-metric-name`}>
          {t("dashboards.editor.metricName")}
        </FieldLabel>
        <MetricNameCombobox
          disabled={disabled}
          id={`${widget.id}-metric-name`}
          onChange={(value) => updateMetricWidget(widget, { metricName: value }, onWidgetChange)}
          range={range}
          telemetryClient={telemetryClient}
          value={widget.metric.metricName}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-metric-aggregation`}>
          {t("dashboards.editor.aggregation")}
        </FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            updateMetricWidget(
              widget,
              { aggregation: value as MetricAggregation },
              onWidgetChange,
            )
          }
          value={widget.metric.aggregation}
        >
          <SelectTrigger id={`${widget.id}-metric-aggregation`}>
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
      <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
        <dt className="text-muted-foreground">{t("dashboards.editor.groupBy")}</dt>
        <dd className="min-w-0 break-words">
          {(widget.metric.groupBy ?? []).join(", ") || t("dashboards.noneConfigured")}
        </dd>
      </div>
      <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
        <dt className="text-muted-foreground">{t("dashboards.editor.filters")}</dt>
        <dd className="min-w-0 break-words">
          {widget.metric.filters?.length
            ? `${widget.metric.filters.length} ${t("filters.title")}`
            : t("dashboards.noneConfigured")}
        </dd>
      </div>
      <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
        <dt className="text-muted-foreground">{t("dashboards.editor.interval")}</dt>
        <dd className="min-w-0 break-words">
          {widget.metric.interval ?? t("dashboards.default")}
        </dd>
      </div>
    </FieldGroup>
  );
}
