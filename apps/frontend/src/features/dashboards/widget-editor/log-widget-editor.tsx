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

export function updateLogWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["logs"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.logs) return;
  onWidgetChange({ ...widget, logs: { ...widget.logs, ...patch } });
}

export function LogWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.logs) return null;

  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-log-query`}>{t("filters.query")}</FieldLabel>
        <SearchInput
          disabled={disabled}
          id={`${widget.id}-log-query`}
          onChange={(event) =>
            updateLogWidget(widget, { search: stringOrNull(event.target.value) }, onWidgetChange)
          }
          placeholder={t("filters.placeholder.search")}
          value={widget.logs.search ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-log-service`}>{t("filters.service")}</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-log-service`}
          onChange={(event) =>
            updateLogWidget(widget, { service: stringOrNull(event.target.value) }, onWidgetChange)
          }
          placeholder={t("filters.placeholder.service")}
          value={widget.logs.service ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-log-severity`}>{t("filters.severity")}</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-log-severity`}
          onChange={(event) =>
            updateLogWidget(widget, { severity: stringOrNull(event.target.value) }, onWidgetChange)
          }
          placeholder={t("filters.placeholder.severity")}
          value={widget.logs.severity ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-log-limit`}>
          {t("dashboards.editor.limit")}
        </FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-log-limit`}
          min={1}
          onChange={(event) =>
            updateLogWidget(widget, { limit: numberOrNull(event.target.value) }, onWidgetChange)
          }
          type="number"
          value={widget.logs.limit ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-log-sort`}>{t("filters.sort")}</FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            updateLogWidget(
              widget,
              { sort: value as NonNullable<NonNullable<typeof widget.logs>["sort"]> },
              onWidgetChange,
            )
          }
          value={widget.logs.sort ?? "timestamp_desc"}
        >
          <SelectTrigger id={`${widget.id}-log-sort`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="timestamp_desc">timestamp_desc</SelectItem>
              <SelectItem value="timestamp_asc">timestamp_asc</SelectItem>
              <SelectItem value="severity_desc">severity_desc</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
