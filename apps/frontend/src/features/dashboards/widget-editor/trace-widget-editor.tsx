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
import { SearchInput } from "../../../components/search-input";
import type { DashboardWidgetInput } from "../../../lib/dashboard-contracts";
import { t } from "../../../lib/i18n";

function stringOrNull(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numberOrNull(value: string | null) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function StatusField({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: "ok" | "error" | "unset" | null) => void;
  value?: "ok" | "error" | "unset" | null;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{t("filters.status")}</FieldLabel>
      <Select
        disabled={disabled}
        onValueChange={(nextValue) =>
          onChange(nextValue === "all" ? null : (nextValue as "ok" | "error" | "unset"))
        }
        value={value ?? "all"}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
            <SelectItem value="ok">ok</SelectItem>
            <SelectItem value="error">error</SelectItem>
            <SelectItem value="unset">unset</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function updateTraceWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["traces"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.traces) return;
  onWidgetChange({ ...widget, traces: { ...widget.traces, ...patch } });
}

export function TraceWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.traces) return null;

  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-trace-query`}>{t("filters.query")}</FieldLabel>
        <SearchInput
          disabled={disabled}
          id={`${widget.id}-trace-query`}
          onChange={(event) =>
            updateTraceWidget(widget, { query: stringOrNull(event.target.value) }, onWidgetChange)
          }
          placeholder={t("filters.placeholder.query")}
          value={widget.traces.query ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-trace-service`}>{t("filters.service")}</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-trace-service`}
          onChange={(event) =>
            updateTraceWidget(widget, { service: stringOrNull(event.target.value) }, onWidgetChange)
          }
          placeholder={t("filters.placeholder.service")}
          value={widget.traces.service ?? ""}
        />
      </Field>
      <StatusField
        disabled={disabled}
        id={`${widget.id}-trace-status`}
        onChange={(value) => updateTraceWidget(widget, { status: value }, onWidgetChange)}
        value={widget.traces.status ?? null}
      />
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-trace-limit`}>Limit</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-trace-limit`}
          min={1}
          onChange={(event) =>
            updateTraceWidget(widget, { limit: numberOrNull(event.target.value) }, onWidgetChange)
          }
          type="number"
          value={widget.traces.limit ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-trace-sort`}>{t("filters.sort")}</FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            updateTraceWidget(
              widget,
              { sort: value as NonNullable<NonNullable<typeof widget.traces>["sort"]> },
              onWidgetChange,
            )
          }
          value={widget.traces.sort ?? "startedAt_desc"}
        >
          <SelectTrigger id={`${widget.id}-trace-sort`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="startedAt_desc">startedAt_desc</SelectItem>
              <SelectItem value="startedAt_asc">startedAt_asc</SelectItem>
              <SelectItem value="duration_desc">duration_desc</SelectItem>
              <SelectItem value="duration_asc">duration_asc</SelectItem>
              <SelectItem value="errorFirst">errorFirst</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
