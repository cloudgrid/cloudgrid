import type {
  Dataset,
  DatasetCurationStatus,
  DatasetSplit,
  EvaluationComparison,
  EvaluationDefinition,
  EvaluationRun,
  JSONValue,
  MetricAggregate,
  MetricResult,
  OptimizationRun,
} from "@cloudgrid/ui-contracts";

export const DATASET_SPLITS: DatasetSplit[] = ["training", "validation", "test"];
export const DATASET_CURATION_STATUSES: DatasetCurationStatus[] = [
  "draft",
  "needs_expected",
  "needs_review",
  "ready",
  "rejected",
];

export function jsonPreview(value: JSONValue | undefined, maxLength = 96) {
  if (value === undefined || value === null) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function datasetCurrentVersionId(dataset: Dataset) {
  const value = dataset as Dataset & {
    currentVersionId?: string | null;
    currentVersion?: { id?: string | null };
  };
  return value.currentVersionId ?? value.currentVersion?.id ?? "";
}

export function datasetReadyItemCount(dataset: Dataset) {
  const value = dataset as Dataset & { readyItemCount?: number | null };
  const health = dataset.health as typeof dataset.health & { readyItemCount?: number | null };
  return value.readyItemCount ?? health.readyItemCount ?? 0;
}

export function datasetHasExtractionSettings(dataset: Dataset) {
  const value = dataset as Dataset & {
    settings?: { traceExtractionSettings?: unknown } | null;
    traceExtractionSettings?: unknown;
  };
  return Boolean(value.settings?.traceExtractionSettings ?? value.traceExtractionSettings);
}

export function compatibleTraceImportDatasets(datasets: Dataset[]) {
  return datasets.filter(datasetHasExtractionSettings);
}

export function splitCoverageLabel(splitCounts: JSONValue) {
  if (!splitCounts || typeof splitCounts !== "object" || Array.isArray(splitCounts)) {
    return "not reported";
  }
  return DATASET_SPLITS.map((split) => `${split}: ${String(splitCounts[split] ?? 0)}`).join(" · ");
}

export function parseRawValue(text: string, type: "json" | "text") {
  if (type === "text") {
    return { value: text, error: null as string | null };
  }
  try {
    return { value: JSON.parse(text) as JSONValue, error: null as string | null };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

export function validateAgainstJsonSchema(value: JSONValue, schema: JSONValue) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  const schemaObject = schema as Record<string, JSONValue>;
  const type = schemaObject.type;
  if (type === "object" && (value === null || typeof value !== "object" || Array.isArray(value))) {
    return "Value must be a JSON object.";
  }
  if (type === "array" && !Array.isArray(value)) {
    return "Value must be a JSON array.";
  }
  if (type === "string" && typeof value !== "string") {
    return "Value must be a string.";
  }
  if (type === "number" && typeof value !== "number") {
    return "Value must be a number.";
  }
  if (type === "boolean" && typeof value !== "boolean") {
    return "Value must be a boolean.";
  }
  if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const required = Array.isArray(schemaObject.required) ? schemaObject.required : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in value)) {
        return `Missing required property "${key}".`;
      }
    }
  }
  return null;
}

export function metricAggregateLabel(aggregate: MetricAggregate) {
  return `${aggregate.metricId} · ${jsonPreview((aggregate.payload.value ?? aggregate.payload.summary ?? aggregate.payload) as JSONValue, 80)}`;
}

export function metricResultLabel(result: MetricResult) {
  return `${result.metricId} · ${jsonPreview((result.payload.value ?? result.payload.summary ?? result.payload) as JSONValue, 80)}`;
}

export function evaluationDisplayName(definition: EvaluationDefinition, datasets: Dataset[]) {
  const dataset = datasets.find((item) => item.id === definition.datasetId);
  return `${definition.name}${dataset ? ` · ${dataset.name}` : ""}`;
}

export function runProgressLabel(run: EvaluationRun) {
  const counts = run.summary.itemCounts as Record<string, number>;
  const total = counts.total ?? run.selectedItemRevisionIds.length;
  const completed = counts.completed ?? 0;
  const failed = counts.failed ?? 0;
  return `${completed}/${total} completed${failed ? ` · ${failed} failed` : ""}`;
}

export function comparisonLabel(comparison: EvaluationComparison) {
  return `${comparison.baselineRunId.slice(0, 10)} → ${comparison.candidateRunId.slice(0, 10)}`;
}

export function optimizationPhaseLabel(run: OptimizationRun) {
  if (run.quickShotPolicy) {
    return "quick-shot";
  }
  if (run.selectedCandidateSnapshotId) {
    return "promotion candidate selected";
  }
  return "full validation";
}
