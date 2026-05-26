import {
  ALERT_RULE_SORTS,
  ALERT_SEVERITIES,
  ALERT_SIGNALS,
  ALERT_STATES,
  type AlertRuleSearchInput,
  buildAlertRuleSearchInput,
} from "@cloudgrid/ui-contracts";

export {
  ALERT_RULE_SORTS as alertRuleSorts,
  ALERT_SEVERITIES as alertSeverities,
  ALERT_SIGNALS as alertSignals,
  ALERT_STATES as alertStatuses,
};

export function readAlertRuleSearchInput(searchParams: URLSearchParams): AlertRuleSearchInput {
  return buildAlertRuleSearchInput({
    search: searchParams.get("search"),
    status: searchParams.get("status"),
    severity: searchParams.get("severity"),
    signal: searchParams.get("signal"),
    enabled: searchParams.get("enabled"),
    sort: searchParams.get("sort"),
  });
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
