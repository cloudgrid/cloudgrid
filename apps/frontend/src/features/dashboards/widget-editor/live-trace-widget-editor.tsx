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

export function updateLiveTraceWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["liveTraces"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.liveTraces) return;
  onWidgetChange({ ...widget, liveTraces: { ...widget.liveTraces, ...patch } });
}

export function LiveTraceWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.liveTraces) return null;

  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-live-query`}>{t("filters.query")}</FieldLabel>
        <SearchInput
          disabled={disabled}
          id={`${widget.id}-live-query`}
          onChange={(event) =>
            updateLiveTraceWidget(
              widget,
              { query: stringOrNull(event.target.value) },
              onWidgetChange,
            )
          }
          placeholder={t("filters.placeholder.query")}
          value={widget.liveTraces.query ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-live-service`}>{t("filters.service")}</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-live-service`}
          onChange={(event) =>
            updateLiveTraceWidget(
              widget,
              { service: stringOrNull(event.target.value) },
              onWidgetChange,
            )
          }
          placeholder={t("filters.placeholder.service")}
          value={widget.liveTraces.service ?? ""}
        />
      </Field>
      <StatusField
        disabled={disabled}
        id={`${widget.id}-live-status`}
        onChange={(value) => updateLiveTraceWidget(widget, { status: value }, onWidgetChange)}
        value={widget.liveTraces.status ?? null}
      />
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-live-limit`}>
          {t("dashboards.editor.limit")}
        </FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-live-limit`}
          min={1}
          onChange={(event) =>
            updateLiveTraceWidget(
              widget,
              { limit: numberOrNull(event.target.value) },
              onWidgetChange,
            )
          }
          type="number"
          value={widget.liveTraces.limit ?? ""}
        />
      </Field>
    </FieldGroup>
  );
}
