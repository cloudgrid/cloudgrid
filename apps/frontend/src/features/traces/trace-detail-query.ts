import type { TraceDetailInput } from "@cloudgrid/ui-contracts";

export function traceDetailQueryInput(input: TraceDetailInput): TraceDetailInput {
  return {
    spanQuery: input.spanQuery ?? null,
    spanService: input.spanService ?? null,
    spanName: input.spanName ?? null,
    spanStatus: input.spanStatus ?? null,
    minSpanDurationMs: input.minSpanDurationMs ?? null,
    maxSpanDurationMs: input.maxSpanDurationMs ?? null,
    attributes: input.attributes ?? null,
    showMatchesOnly: input.showMatchesOnly ?? false,
    relatedLogLimit: input.relatedLogLimit ?? null,
    logSearch: input.logSearch ?? null,
  };
}
