import type { MetricAggregation } from "@cloudgrid/ui-contracts";
import { METRIC_AGGREGATIONS } from "@cloudgrid/ui-contracts";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
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
import type {
  DashboardMetricFormulaInput,
  DashboardMetricQueryInput,
  DashboardMetricQueryRowInput,
  DashboardWidgetInput,
} from "../../../lib/dashboard-contracts";
import { t } from "../../../lib/i18n";
import { MetricNameCombobox } from "../../metrics/metric-query-controls";
import type { useTelemetryClient } from "../../../providers/telemetry-client-provider";

export const RICH_METRIC_EDITING_ENABLED = false;

export function isRichMetricEditingEnabled(): boolean {
  return RICH_METRIC_EDITING_ENABLED;
}

export function RichMetricUnsupportedState() {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      Rich metric widgets can render saved data, but creation and editing stay disabled until the
      complete rich metric implementation gate passes.
    </div>
  );
}

const metricAggregations: MetricAggregation[] = [...METRIC_AGGREGATIONS];

function stringOrNull(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function csvToList(value: string | null) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export function defaultRichMetricQueryRow(index: number): DashboardMetricQueryRowInput {
  const suffix = String.fromCharCode(96 + index);
  return {
    id: `query-${suffix}`,
    label: `Query ${suffix.toUpperCase()}`,
    metricName: "gen_ai.client.token.usage",
    aggregation: "sum",
    groupBy: [],
    filters: [],
    maxSeries: 20,
  };
}

export function defaultRichMetricQuery(): DashboardMetricQueryInput {
  const query = defaultRichMetricQueryRow(1);
  return {
    timeWindow: "PT1H",
    interval: "PT1M",
    queries: [query],
    formulas: [],
    displaySeries: [
      { id: "display-query-a", label: query.label, sourceId: query.id, visible: true },
    ],
  };
}

export function addRichMetricQueryRow(
  query: DashboardMetricQueryInput,
): Partial<DashboardMetricQueryInput> {
  const row = defaultRichMetricQueryRow((query.queries ?? []).length + 1);
  return {
    queries: [...(query.queries ?? []), row],
    displaySeries: [
      ...(query.displaySeries ?? []),
      { id: `display-${row.id}`, label: row.label, sourceId: row.id, visible: true },
    ],
  };
}

export function addRichMetricFormula(
  formulas: DashboardMetricFormulaInput[],
  queries: DashboardMetricQueryRowInput[],
) {
  const left = queries[0]?.id ?? "query-a";
  const right = queries[1]?.id ?? left;
  const formula: DashboardMetricFormulaInput = {
    id: `formula-${formulas.length + 1}`,
    label: `Formula ${formulas.length + 1}`,
    expression: {
      kind: "function",
      function: "ratio",
      arguments: [
        { kind: "ref", refId: left },
        { kind: "ref", refId: right },
      ],
    },
  };
  return [...formulas, formula];
}

export function describeFormulaExpression(
  expression: DashboardMetricFormulaInput["expression"],
): string {
  if (expression.kind === "ref") {
    return expression.refId ?? t("value.none");
  }
  if (expression.kind === "number") {
    return String(expression.value ?? 0);
  }
  if (expression.kind === "function") {
    return `${expression.function ?? "function"}(${(expression.arguments ?? [])
      .map(describeFormulaExpression)
      .join(", ")})`;
  }
  if (expression.kind === "binary") {
    return `${describeFormulaExpression(expression.left ?? { kind: "number", value: 0 })} ${
      expression.operator ?? "add"
    } ${describeFormulaExpression(expression.right ?? { kind: "number", value: 0 })}`;
  }
  return expression.kind;
}

function updateRichMetricQuery(
  widget: DashboardWidgetInput,
  patch: Partial<DashboardMetricQueryInput>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.richMetric) return;
  onWidgetChange({
    ...widget,
    richMetric: { ...widget.richMetric, query: { ...widget.richMetric.query, ...patch } },
  });
}

export function RichMetricWidgetEditor({
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
  if (!widget.richMetric) return null;

  const { query } = widget.richMetric;
  const updateQuery = (patch: Partial<DashboardMetricQueryInput>) =>
    updateRichMetricQuery(widget, patch, onWidgetChange);

  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-rich-interval`}>
          {t("dashboards.editor.interval")}
        </FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-rich-interval`}
          onChange={(event) => updateQuery({ interval: stringOrNull(event.target.value) })}
          value={query.interval ?? ""}
        />
      </Field>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Queries</h3>
          <Button
            disabled={disabled}
            onClick={() => updateQuery(addRichMetricQueryRow(query))}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add query
          </Button>
        </div>
        {(query.queries ?? []).map((row, index) => (
          <RichMetricQueryRowEditor
            disabled={disabled}
            key={row.id}
            onChange={(nextRow) =>
              updateQuery({
                queries: query.queries.map((candidate) =>
                  candidate.id === row.id ? nextRow : candidate,
                ),
              })
            }
            onRemove={() =>
              updateQuery({
                queries: (query.queries ?? []).filter((candidate) => candidate.id !== row.id),
                displaySeries: (query.displaySeries ?? []).filter(
                  (series) => series.sourceId !== row.id,
                ),
              })
            }
            range={range}
            row={row}
            rowNumber={index + 1}
            telemetryClient={telemetryClient}
          />
        ))}
      </div>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Formulas</h3>
          <Button
            disabled={disabled}
            onClick={() =>
              updateQuery({ formulas: addRichMetricFormula(query.formulas ?? [], query.queries) })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add formula
          </Button>
        </div>
        {(query.formulas ?? []).map((formula) => (
          <div className="grid gap-2 border p-2" key={formula.id}>
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${widget.id}-${formula.id}-label`}>Label</FieldLabel>
              <Input
                disabled={disabled}
                id={`${widget.id}-${formula.id}-label`}
                onChange={(event) =>
                  updateQuery({
                    formulas: (query.formulas ?? []).map((candidate) =>
                      candidate.id === formula.id
                        ? {
                            ...candidate,
                            label: stringOrNull(event.target.value) ?? candidate.label,
                          }
                        : candidate,
                    ),
                  })
                }
                placeholder="Label"
                value={formula.label}
              />
            </Field>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-sm">
              <dt className="text-muted-foreground">Formula</dt>
              <dd className="min-w-0 break-words">
                {describeFormulaExpression(formula.expression)}
              </dd>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Display series</h3>
        {(query.displaySeries ?? []).map((series) => (
          <div className="flex items-center gap-2 text-sm" key={series.id}>
            <Checkbox
              aria-label={series.label}
              checked={series.visible ?? true}
              disabled={disabled}
              onCheckedChange={(checked) =>
                updateQuery({
                  displaySeries: (query.displaySeries ?? []).map((candidate) =>
                    candidate.id === series.id
                      ? { ...candidate, visible: checked === true }
                      : candidate,
                  ),
                })
              }
            />
            <span>{series.label}</span>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}

function RichMetricQueryRowEditor({
  disabled,
  onChange,
  onRemove,
  range,
  row,
  rowNumber,
  telemetryClient,
}: {
  disabled: boolean;
  onChange: (row: DashboardMetricQueryRowInput) => void;
  onRemove: () => void;
  range: { from: string; to: string };
  row: DashboardMetricQueryRowInput;
  rowNumber: number;
  telemetryClient: ReturnType<typeof useTelemetryClient>;
}) {
  return (
    <div className="grid gap-2 border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">Query {rowNumber}</div>
        <Button
          aria-label={t("dashboards.editor.removeQuery")}
          disabled={disabled}
          onClick={onRemove}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-label`}>Label</FieldLabel>
        <Input
          disabled={disabled}
          id={`${row.id}-label`}
          onChange={(event) =>
            onChange({ ...row, label: stringOrNull(event.target.value) ?? row.label })
          }
          placeholder="Label"
          value={row.label}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-metric`}>{t("dashboards.editor.metricName")}</FieldLabel>
        <MetricNameCombobox
          disabled={disabled}
          id={`${row.id}-metric`}
          onChange={(value) => onChange({ ...row, metricName: value })}
          range={range}
          telemetryClient={telemetryClient}
          value={row.metricName}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-aggregation`}>
          {t("dashboards.editor.aggregation")}
        </FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) => onChange({ ...row, aggregation: value as MetricAggregation })}
          value={row.aggregation}
        >
          <SelectTrigger id={`${row.id}-aggregation`}>
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
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-group-by`}>{t("dashboards.editor.groupBy")}</FieldLabel>
        <Input
          disabled={disabled}
          id={`${row.id}-group-by`}
          onChange={(event) => onChange({ ...row, groupBy: csvToList(event.target.value) })}
          placeholder="service.name, http.route"
          value={(row.groupBy ?? []).join(", ")}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${row.id}-max-series`}>Max series</FieldLabel>
        <Input
          disabled={disabled}
          id={`${row.id}-max-series`}
          min={1}
          onChange={(event) => {
            const val = stringOrNull(event.target.value);
            const parsed = val ? Number(val) : null;
            onChange({ ...row, maxSeries: Number.isFinite(parsed) ? (parsed as number) : null });
          }}
          type="number"
          value={row.maxSeries ?? ""}
        />
      </Field>
    </div>
  );
}
