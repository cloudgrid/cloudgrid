import { Field, FieldGroup, FieldLabel } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import type { DashboardWidgetInput } from "../../../lib/dashboard-contracts";

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

function csvToList(value: string | null) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export function updateAlertWidget(
  widget: DashboardWidgetInput,
  patch: Partial<NonNullable<DashboardWidgetInput["alert"]>>,
  onWidgetChange: (widget: DashboardWidgetInput) => void,
) {
  if (!widget.alert) return;
  onWidgetChange({ ...widget, alert: { ...widget.alert, ...patch } });
}

export function AlertWidgetEditor({
  disabled,
  onWidgetChange,
  widget,
}: {
  disabled: boolean;
  onWidgetChange: (widget: DashboardWidgetInput) => void;
  widget: DashboardWidgetInput;
}) {
  if (!widget.alert) return null;

  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-alert-rule-ids`}>Rule IDs</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-alert-rule-ids`}
          onChange={(event) =>
            updateAlertWidget(widget, { ruleIds: csvToList(event.target.value) }, onWidgetChange)
          }
          placeholder="rule-1, rule-2"
          value={(widget.alert.ruleIds ?? []).join(", ")}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-alert-states`}>States</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-alert-states`}
          onChange={(event) =>
            updateAlertWidget(
              widget,
              {
                states: csvToList(event.target.value) as NonNullable<
                  NonNullable<typeof widget.alert>["states"]
                >,
              },
              onWidgetChange,
            )
          }
          placeholder="FIRING, RESOLVED"
          value={(widget.alert.states ?? []).join(", ")}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-alert-severities`}>Severities</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-alert-severities`}
          onChange={(event) =>
            updateAlertWidget(
              widget,
              {
                severities: csvToList(event.target.value) as NonNullable<
                  NonNullable<typeof widget.alert>["severities"]
                >,
              },
              onWidgetChange,
            )
          }
          placeholder="ERROR, CRITICAL"
          value={(widget.alert.severities ?? []).join(", ")}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-alert-signals`}>Signals</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-alert-signals`}
          onChange={(event) =>
            updateAlertWidget(
              widget,
              {
                signals: csvToList(event.target.value) as NonNullable<
                  NonNullable<typeof widget.alert>["signals"]
                >,
              },
              onWidgetChange,
            )
          }
          placeholder="METRIC, LOG, TRACE"
          value={(widget.alert.signals ?? []).join(", ")}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-alert-window`}>Time window</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-alert-window`}
          onChange={(event) =>
            updateAlertWidget(
              widget,
              { timeWindow: stringOrNull(event.target.value) },
              onWidgetChange,
            )
          }
          placeholder="PT1H"
          value={widget.alert.timeWindow ?? ""}
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${widget.id}-alert-limit`}>Limit</FieldLabel>
        <Input
          disabled={disabled}
          id={`${widget.id}-alert-limit`}
          min={1}
          onChange={(event) =>
            updateAlertWidget(widget, { limit: numberOrNull(event.target.value) }, onWidgetChange)
          }
          type="number"
          value={widget.alert.limit ?? ""}
        />
      </Field>
    </FieldGroup>
  );
}
