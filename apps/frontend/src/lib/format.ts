import type { JSONValue, TraceStatus } from "@cloudgrid/ui-contracts";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function formatDuration(value?: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(2)} s`;
}

export function jsonPreview(value: JSONValue) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function statusVariant(status?: TraceStatus | null) {
  if (status === "error") {
    return "destructive" as const;
  }

  if (status === "ok") {
    return "secondary" as const;
  }

  return "outline" as const;
}
