import type { AlertRuleKind } from "@cloudgrid/ui-contracts";

export function alertRuleSignal(kind: AlertRuleKind) {
  if (kind.startsWith("METRIC_")) {
    return "METRIC";
  }
  if (kind.startsWith("LOG_")) {
    return "LOG";
  }
  return "TRACE";
}

export function safeAlertTab(value: string) {
  return value === "history" || value === "silences" ? value : "overview";
}

export function formatDurationSeconds(seconds: number) {
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}
