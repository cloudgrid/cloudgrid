import type {
  AlertRuleKind,
  AlertSeverity,
  CreateAlertRuleInput,
  JSONValue,
  Project,
} from "@cloudgrid/ui-contracts";
import { Save } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { t } from "../../lib/i18n";

const alertKinds: AlertRuleKind[] = [
  "METRIC_THRESHOLD",
  "METRIC_ABSENCE",
  "LOG_MATCH",
  "LOG_COUNT",
  "TRACE_MATCH",
  "TRACE_COUNT",
  "TRACE_LATENCY",
  "TRACE_ERROR",
];

const alertSeverities: AlertSeverity[] = ["INFO", "WARNING", "ERROR", "CRITICAL"];

export function AlertRuleEditorSheet({
  error,
  onOpenChange,
  onSubmit,
  open,
  pending,
  project,
}: {
  error: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateAlertRuleInput) => void;
  open: boolean;
  pending: boolean;
  project: Project;
}) {
  const [kind, setKind] = useState<AlertRuleKind>("TRACE_ERROR");
  const [alertSeverity, setAlertSeverity] = useState<AlertSeverity>("ERROR");
  const [query, setQuery] = useState<AlertQueryDraft>(() => defaultAlertQueryDraft("TRACE_ERROR"));
  const [condition, setCondition] = useState<AlertConditionDraft>(() =>
    defaultAlertConditionDraft("TRACE_ERROR"),
  );

  function changeKind(value: AlertRuleKind) {
    setKind(value);
    setQuery(defaultAlertQueryDraft(value));
    setCondition(defaultAlertConditionDraft(value));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      projectId: project.id,
      name: String(form.get("name") ?? "").trim(),
      enabled: form.get("enabled") === "on",
      kind,
      severity: alertSeverity,
      query: serializeAlertQuery(kind, query),
      condition: serializeAlertCondition(kind, condition),
      evaluationWindowSeconds: numberField(form.get("evaluationWindowSeconds")) ?? 300,
      pendingForSeconds: numberField(form.get("pendingForSeconds")) ?? 60,
      cooldownSeconds: numberField(form.get("cooldownSeconds")) ?? 300,
      notificationAdapterIds: ["in_app"],
    });
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-auto sm:max-w-[520px]" side="right">
        <SheetHeader>
          <SheetTitle>{t("alerts.create")}</SheetTitle>
          <SheetDescription>{t("alerts.description")}</SheetDescription>
        </SheetHeader>
        <form className="grid flex-1 gap-5 px-4" onSubmit={submit}>
          <EditorSection title={t("alerts.basics")}>
            <div className="grid gap-1">
              <Label htmlFor="alert-name">{t("alerts.name")}</Label>
              <Input
                id="alert-name"
                name="name"
                placeholder={t("alerts.namePlaceholder")}
                required
              />
            </div>
            <Label className="flex items-center gap-2 text-sm" htmlFor="alert-enabled">
              <Checkbox defaultChecked id="alert-enabled" name="enabled" />
              {t("alerts.enabled")}
            </Label>
            <div className="grid gap-1">
              <Label htmlFor="alert-kind">{t("alerts.kind")}</Label>
              <Select onValueChange={(value) => changeKind(value as AlertRuleKind)} value={kind}>
                <SelectTrigger id="alert-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {alertKinds.map((candidate) => (
                      <SelectItem key={candidate} value={candidate}>
                        {candidate}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="alert-severity-input">{t("alerts.severity")}</Label>
              <Select
                onValueChange={(value) => setAlertSeverity(value as AlertSeverity)}
                value={alertSeverity}
              >
                <SelectTrigger id="alert-severity-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {alertSeverities.map((candidate) => (
                      <SelectItem key={candidate} value={candidate}>
                        {candidate}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </EditorSection>
          <EditorSection title={t("alerts.signalQuery")}>
            <AlertSignalQueryControls kind={kind} onChange={setQuery} value={query} />
          </EditorSection>
          <EditorSection title={t("alerts.condition")}>
            <AlertConditionControls kind={kind} onChange={setCondition} value={condition} />
          </EditorSection>
          <EditorSection title={t("alerts.timing")}>
            <NumberInput
              defaultValue={300}
              label={t("alerts.evaluationWindow")}
              name="evaluationWindowSeconds"
            />
            <NumberInput
              defaultValue={60}
              label={t("alerts.pendingFor")}
              name="pendingForSeconds"
            />
            <NumberInput defaultValue={300} label={t("alerts.cooldown")} name="cooldownSeconds" />
          </EditorSection>
          <EditorSection title={t("alerts.notifications")}>
            <Label className="flex items-center gap-2 text-sm" htmlFor="alert-in-app">
              <Checkbox checked disabled id="alert-in-app" />
              {t("alerts.inAppNotifications")}
            </Label>
          </EditorSection>
          {error ? <p className="text-sm text-destructive">{t("alerts.createError")}</p> : null}
          <SheetFooter className="px-0">
            <Button disabled={pending} type="submit">
              <Save data-icon="inline-start" />
              {t("alerts.save")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function AlertSignalQueryControls({
  kind,
  onChange,
  value,
}: {
  kind: AlertRuleKind;
  onChange: (value: AlertQueryDraft) => void;
  value: AlertQueryDraft;
}) {
  if (kind.startsWith("METRIC_")) {
    return (
      <>
        <TextInput
          id="alert-metric-name"
          label={t("alerts.metricName")}
          onChange={(metricName) => onChange({ ...value, metricName })}
          value={value.metricName}
        />
        <TextInput
          id="alert-metric-service"
          label={t("filters.service")}
          onChange={(service) => onChange({ ...value, service })}
          value={value.service}
        />
      </>
    );
  }
  if (kind.startsWith("LOG_")) {
    return (
      <>
        <TextInput
          id="alert-log-search"
          label={t("filters.search")}
          onChange={(search) => onChange({ ...value, search })}
          value={value.search}
        />
        <TextInput
          id="alert-log-service"
          label={t("filters.service")}
          onChange={(service) => onChange({ ...value, service })}
          value={value.service}
        />
        <TextInput
          id="alert-log-severity"
          label={t("filters.severity")}
          onChange={(severity) => onChange({ ...value, severity })}
          value={value.severity}
        />
      </>
    );
  }
  return (
    <>
      <TextInput
        id="alert-trace-query"
        label={t("filters.query")}
        onChange={(search) => onChange({ ...value, search })}
        value={value.search}
      />
      <TextInput
        id="alert-trace-service"
        label={t("filters.service")}
        onChange={(service) => onChange({ ...value, service })}
        value={value.service}
      />
      <div className="grid gap-1">
        <Label htmlFor="alert-trace-status">{t("alerts.status")}</Label>
        <Select
          onValueChange={(status) => onChange({ ...value, status })}
          value={value.status || "all"}
        >
          <SelectTrigger id="alert-trace-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("value.all")}</SelectItem>
              <SelectItem value="ok">ok</SelectItem>
              <SelectItem value="error">error</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function AlertConditionControls({
  kind,
  onChange,
  value,
}: {
  kind: AlertRuleKind;
  onChange: (value: AlertConditionDraft) => void;
  value: AlertConditionDraft;
}) {
  if (kind === "METRIC_ABSENCE") {
    return (
      <NumberDraftInput
        id="alert-max-count"
        label="Max allowed count"
        onChange={(maxAllowedCount) => onChange({ ...value, maxAllowedCount })}
        value={value.maxAllowedCount}
      />
    );
  }
  if (kind.endsWith("_MATCH") || kind === "TRACE_ERROR") {
    return (
      <NumberDraftInput
        id="alert-min-count"
        label="Minimum count"
        onChange={(minCount) => onChange({ ...value, minCount })}
        value={value.minCount}
      />
    );
  }
  return (
    <>
      <div className="grid gap-1">
        <Label htmlFor="alert-condition-operator">{t("alerts.operator")}</Label>
        <Select
          onValueChange={(operator) => onChange({ ...value, operator })}
          value={value.operator || "GTE"}
        >
          <SelectTrigger id="alert-condition-operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="GTE">GTE</SelectItem>
              <SelectItem value="GT">GT</SelectItem>
              <SelectItem value="LTE">LTE</SelectItem>
              <SelectItem value="LT">LT</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <NumberDraftInput
        id="alert-threshold"
        label="Threshold"
        onChange={(threshold) => onChange({ ...value, threshold })}
        value={value.threshold}
      />
    </>
  );
}

type AlertQueryDraft = {
  metricName?: string;
  search?: string;
  service?: string;
  severity?: string;
  status?: string;
};

type AlertConditionDraft = {
  maxAllowedCount?: number | undefined;
  minCount?: number | undefined;
  operator?: string | undefined;
  threshold?: number | undefined;
};

function defaultAlertQueryDraft(kind: AlertRuleKind): AlertQueryDraft {
  if (kind.startsWith("METRIC_")) {
    return { metricName: "" };
  }
  if (kind.startsWith("LOG_")) {
    return { search: "" };
  }
  return { status: kind === "TRACE_ERROR" ? "error" : "" };
}

function defaultAlertConditionDraft(kind: AlertRuleKind): AlertConditionDraft {
  if (kind === "METRIC_ABSENCE") {
    return { maxAllowedCount: 0 };
  }
  if (kind.endsWith("_MATCH") || kind === "TRACE_ERROR") {
    return { minCount: 1 };
  }
  return { operator: "GTE", threshold: 1 };
}

function serializeAlertQuery(kind: AlertRuleKind, value: AlertQueryDraft): JSONValue {
  if (kind.startsWith("METRIC_")) {
    return compactJson({ metricName: value.metricName, service: value.service });
  }
  if (kind.startsWith("LOG_")) {
    return compactJson({ search: value.search, service: value.service, severity: value.severity });
  }
  return compactJson({
    search: value.search,
    service: value.service,
    status: value.status === "all" ? null : value.status,
  });
}

function serializeAlertCondition(kind: AlertRuleKind, value: AlertConditionDraft): JSONValue {
  if (kind === "METRIC_ABSENCE") {
    return { maxAllowedCount: value.maxAllowedCount ?? 0 };
  }
  if (kind.endsWith("_MATCH") || kind === "TRACE_ERROR") {
    return { minCount: value.minCount ?? 1 };
  }
  return { operator: value.operator ?? "GTE", threshold: value.threshold ?? 1 };
}

function compactJson(value: Record<string, string | number | null | undefined>): JSONValue {
  const result: Record<string, JSONValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null && entry !== undefined && entry !== "") {
      result[key] = entry;
    }
  }
  return result;
}

function EditorSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3 border-t pt-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function TextInput({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value?: string | undefined;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value ?? ""}
      />
    </div>
  );
}

function NumberDraftInput({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: number | undefined) => void;
  value?: number | undefined;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        min={0}
        onChange={(event) => onChange(numberField(event.currentTarget.value) ?? undefined)}
        type="number"
        value={value ?? 0}
      />
    </div>
  );
}

function NumberInput({
  defaultValue,
  label,
  name,
}: {
  defaultValue: number;
  label: string;
  name: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={`alert-${name}`}>{label}</Label>
      <Input defaultValue={defaultValue} id={`alert-${name}`} min={0} name={name} type="number" />
    </div>
  );
}

function numberField(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
