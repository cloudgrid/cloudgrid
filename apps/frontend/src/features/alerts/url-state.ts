import type {
  AlertRuleSearchInput,
  AlertRuleSort,
  AlertSeverity,
  AlertSignal,
  AlertState,
} from "@cloudgrid/ui-contracts";

export const alertStatuses: AlertState[] = [
  "OK",
  "PENDING",
  "FIRING",
  "RESOLVED",
  "SILENCED",
  "ERROR",
];
export const alertSeverities: AlertSeverity[] = ["INFO", "WARNING", "ERROR", "CRITICAL"];
export const alertSignals: AlertSignal[] = ["METRIC", "LOG", "TRACE"];
export const alertRuleSorts: AlertRuleSort[] = [
  "updatedAt_desc",
  "updatedAt_asc",
  "createdAt_desc",
  "createdAt_asc",
  "name_asc",
  "name_desc",
  "severity_asc",
  "severity_desc",
  "kind_asc",
  "kind_desc",
  "enabled_asc",
  "enabled_desc",
];

export function readAlertRuleSearchInput(searchParams: URLSearchParams): AlertRuleSearchInput {
  return {
    search: stringOrNull(searchParams.get("search")),
    status: alertStateOrNull(searchParams.get("status")),
    severity: alertSeverityOrNull(searchParams.get("severity")),
    signal: alertSignalOrNull(searchParams.get("signal")),
    enabled: enabledOrNull(searchParams.get("enabled")),
    sort: alertRuleSortOrNull(searchParams.get("sort")) ?? "updatedAt_desc",
  };
}

export function hasAlertRuleFilters(input: AlertRuleSearchInput) {
  return Boolean(
    input.search || input.status || input.severity || input.signal || input.enabled !== null,
  );
}

export function writeAlertRuleFilter(
  setSearchParams: (nextInit: (current: URLSearchParams) => URLSearchParams) => void,
  key: keyof AlertRuleSearchInput,
  value: string | boolean | null,
) {
  setSearchParams((current) => {
    if (value === null || value === "" || value === "all") {
      current.delete(key);
    } else {
      current.set(key, String(value));
    }
    current.delete("ruleId");
    return current;
  });
}

function stringOrNull(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function alertStateOrNull(value: string | null): AlertState | null {
  return alertStatuses.includes(value as AlertState) ? (value as AlertState) : null;
}

function alertSeverityOrNull(value: string | null): AlertSeverity | null {
  return alertSeverities.includes(value as AlertSeverity) ? (value as AlertSeverity) : null;
}

function alertSignalOrNull(value: string | null): AlertSignal | null {
  return alertSignals.includes(value as AlertSignal) ? (value as AlertSignal) : null;
}

function alertRuleSortOrNull(value: string | null): AlertRuleSort | null {
  return alertRuleSorts.includes(value as AlertRuleSort) ? (value as AlertRuleSort) : null;
}

function enabledOrNull(value: string | null) {
  if (value === "true" || value === "enabled") {
    return true;
  }
  if (value === "false" || value === "disabled") {
    return false;
  }
  return null;
}
