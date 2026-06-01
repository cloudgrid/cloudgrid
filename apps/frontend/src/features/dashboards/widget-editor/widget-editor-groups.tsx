import type { MetricChartType } from "@cloudgrid/ui-contracts";
import { METRIC_CHART_TYPES } from "@cloudgrid/ui-contracts";
import type { ReactNode } from "react";
import { Field, FieldGroup, FieldLabel } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
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
import type { useTelemetryClient } from "../../../providers/telemetry-client-provider";
import { AlertWidgetEditor } from "./alert-widget-editor";
import { LiveTraceWidgetEditor } from "./live-trace-widget-editor";
import { LogWidgetEditor } from "./log-widget-editor";
import { MetricWidgetEditor, updateMetricWidget } from "./metric-widget-editor";
import {
  isRichMetricEditingEnabled,
  RichMetricUnsupportedState,
  RichMetricWidgetEditor,
} from "./rich-metric-widget-editor";
import { TraceWidgetEditor } from "./trace-widget-editor";

const metricChartTypes: MetricChartType[] = [...METRIC_CHART_TYPES];

function updateRichMetricWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["richMetric"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.richMetric) return;
  onWidgetChange({ ...widget, richMetric: { ...widget.richMetric, ...patch } });
}

function EditorGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function WidgetEditorGroups({
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
  return (
    <div className="flex flex-col gap-4">
      <EditorGroup title={t("dashboards.editor.data")}>
        {widget.metric ? (
          <MetricWidgetEditor
            disabled={disabled}
            onWidgetChange={onWidgetChange}
            range={range}
            telemetryClient={telemetryClient}
            widget={widget}
          />
        ) : widget.richMetric ? (
          !isRichMetricEditingEnabled() ? (
            <RichMetricUnsupportedState />
          ) : (
            <RichMetricWidgetEditor
              disabled={disabled}
              onWidgetChange={onWidgetChange}
              range={range}
              telemetryClient={telemetryClient}
              widget={widget}
            />
          )
        ) : widget.logs ? (
          <LogWidgetEditor disabled={disabled} onWidgetChange={onWidgetChange} widget={widget} />
        ) : widget.traces ? (
          <TraceWidgetEditor disabled={disabled} onWidgetChange={onWidgetChange} widget={widget} />
        ) : widget.liveTraces ? (
          <LiveTraceWidgetEditor
            disabled={disabled}
            onWidgetChange={onWidgetChange}
            widget={widget}
          />
        ) : widget.alert ? (
          <AlertWidgetEditor disabled={disabled} onWidgetChange={onWidgetChange} widget={widget} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("dashboards.widget.noDataSource")}</p>
        )}
      </EditorGroup>
      <EditorGroup title={t("dashboards.editor.display")}>
        <FieldGroup>
          <Field data-disabled={disabled}>
            <FieldLabel htmlFor={`${widget.id}-title`}>{t("dashboards.editor.title")}</FieldLabel>
            <Input
              disabled={disabled}
              id={`${widget.id}-title`}
              onChange={(event) => onWidgetChange({ ...widget, title: event.target.value })}
              value={widget.title}
            />
          </Field>
          {widget.metric || widget.richMetric ? (
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${widget.id}-visualization`}>
                {t("dashboards.editor.chartType")}
              </FieldLabel>
              <Select
                disabled={disabled}
                onValueChange={(value) => {
                  if (widget.metric) {
                    updateMetricWidget(
                      widget,
                      {
                        visualization: value as NonNullable<typeof widget.metric>["visualization"],
                      },
                      onWidgetChange,
                    );
                    return;
                  }
                  updateRichMetricWidget(
                    widget,
                    {
                      visualization: value as NonNullable<
                        typeof widget.richMetric
                      >["visualization"],
                    },
                    onWidgetChange,
                  );
                }}
                value={widget.metric?.visualization ?? widget.richMetric?.visualization ?? "line"}
              >
                <SelectTrigger id={`${widget.id}-visualization`}>
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
          ) : widget.alert ? (
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
              <dt className="text-muted-foreground">{t("dashboards.editor.mode")}</dt>
              <dd className="min-w-0 break-words">{widget.kind}</dd>
            </div>
          ) : (
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
              <dt className="text-muted-foreground">{t("dashboards.editor.mode")}</dt>
              <dd className="min-w-0 break-words">{t("dashboards.editor.compactTable")}</dd>
            </div>
          )}
          <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
            <dt className="text-muted-foreground">{t("dashboards.editor.layout")}</dt>
            <dd className="min-w-0 break-words">
              x {widget.layout.x}, y {widget.layout.y}, w {widget.layout.w}, h {widget.layout.h}
            </dd>
          </div>
        </FieldGroup>
      </EditorGroup>
      <EditorGroup title={t("dashboards.editor.thresholds")}>
        {widget.metric || widget.richMetric ? (
          <dl className="grid gap-2 text-sm">
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{t("dashboards.editor.title")}</dt>
              <dd className="min-w-0 break-words">{widget.title}</dd>
            </div>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{t("dashboards.kind")}</dt>
              <dd className="min-w-0 break-words">{widget.kind}</dd>
            </div>
            {widget.metric ? (
              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">{t("dashboards.metric.label")}</dt>
                <dd className="min-w-0 break-words">{widget.metric.metricName}</dd>
              </div>
            ) : null}
            {widget.richMetric ? (
              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">{t("dashboards.widget.richMetric")}</dt>
                <dd className="min-w-0 break-words">
                  {widget.richMetric.query.queries.map((query) => query.label).join(", ")}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("dashboards.editor.thresholdsUnavailable")}
          </p>
        )}
      </EditorGroup>
    </div>
  );
}
