import type {
  AlertRuleSearchInput,
  AlertRuleSort,
  AlertSeverity,
  AlertSignal,
  AlertState,
} from "./index";
import { ALERT_SEVERITIES, ALERT_STATES } from "./generated";

export const ALERT_SIGNALS = ["METRIC", "LOG", "TRACE"] as const satisfies readonly AlertSignal[];

export const ALERT_RULE_SORTS = [
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
] as const satisfies readonly AlertRuleSort[];

export const ALERT_HISTORY_DEFAULT_FIRST = 50;
export const ALERT_HISTORY_HARD_FIRST = 200;

/** Optional alert rule query overrides accepted by UI routes and AI tool callers. */
export interface AlertRuleSearchDefaultsInput {
  search?: string | null;
  status?: string | null;
  severity?: string | null;
  signal?: string | null;
  enabled?: boolean | string | null;
  sort?: string | null;
}

/** Optional alert history paging overrides accepted by UI routes and AI tool callers. */
export interface AlertHistoryDefaultsInput {
  ruleId?: string | null;
  first?: number | null;
  after?: string | null;
}

/** Returns the canonical default alert rule sort used across UI and AI tool calls. */
export function defaultAlertRuleSort(): AlertRuleSort {
  return "updatedAt_desc";
}

/** Normalizes an arbitrary alert rule sort value to the canonical default when unsupported. */
export function alertRuleSortOrDefault(value: string | null | undefined): AlertRuleSort {
  return ALERT_RULE_SORTS.includes(value as AlertRuleSort)
    ? (value as AlertRuleSort)
    : defaultAlertRuleSort();
}

/** Builds a drift-resistant `AlertRuleSearchInput` with shared defaults and enum validation. */
export function buildAlertRuleSearchInput(
  input: AlertRuleSearchDefaultsInput = {},
): AlertRuleSearchInput {
  return {
    search: stringOrNull(input.search),
    status: ALERT_STATES.includes(input.status as AlertState) ? (input.status as AlertState) : null,
    severity: ALERT_SEVERITIES.includes(input.severity as AlertSeverity)
      ? (input.severity as AlertSeverity)
      : null,
    signal: ALERT_SIGNALS.includes(input.signal as AlertSignal)
      ? (input.signal as AlertSignal)
      : null,
    enabled: enabledOrNull(input.enabled),
    sort: alertRuleSortOrDefault(input.sort),
  };
}

/** Builds bounded alert history query input with the shared default and hard limit. */
export function buildAlertHistoryInput(input: AlertHistoryDefaultsInput = {}) {
  return {
    ruleId: stringOrNull(input.ruleId),
    first: boundedAlertHistoryFirst(input.first),
    after: stringOrNull(input.after),
  };
}

function boundedAlertHistoryFirst(first: number | null | undefined) {
  if (typeof first !== "number" || !Number.isFinite(first)) {
    return ALERT_HISTORY_DEFAULT_FIRST;
  }
  return Math.min(Math.max(1, Math.trunc(first)), ALERT_HISTORY_HARD_FIRST);
}

function stringOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function enabledOrNull(value: boolean | string | null | undefined) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "enabled") {
    return true;
  }
  if (value === "false" || value === "disabled") {
    return false;
  }
  return null;
}
