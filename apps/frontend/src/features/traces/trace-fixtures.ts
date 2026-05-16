import type {
  LogEvent,
  ServiceTraceBreakdown,
  Span,
  SpanMatch,
  TraceDetail,
  TraceWarning,
} from "@cloudgrid/ui-contracts";

const fixtureTraceId = "00000000000000000000000000000001";
const baseStartedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0, 0);
const services = ["gateway", "agent-api", "planner", "worker", "vector-store", "llm-proxy"];

interface SpanSeed {
  index: number;
  parentIndex: number | null;
  depth: number;
  offsetMs: number;
  durationMs: number;
  serviceName?: string;
  name?: string;
  hasError?: boolean;
  isCriticalPath?: boolean;
  isOrphan?: boolean;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function spanId(index: number) {
  return `span-${index.toString(16).padStart(16, "0")}`;
}

function makeSpan(seed: SpanSeed): Span {
  const id = spanId(seed.index);
  const serviceName = seed.serviceName ?? services[seed.index % services.length] ?? "service";
  const startedAtMs = baseStartedAtMs + seed.offsetMs;

  return {
    id,
    traceId: fixtureTraceId,
    parentSpanId: seed.parentIndex === null ? null : spanId(seed.parentIndex),
    name: seed.name ?? `${serviceName}.operation.${seed.index}`,
    kind: seed.index === 0 ? "SERVER" : seed.index % 3 === 0 ? "CLIENT" : "INTERNAL",
    serviceName,
    startedAt: iso(startedAtMs),
    endedAt: iso(startedAtMs + seed.durationMs),
    durationMs: seed.durationMs,
    status: seed.hasError ? "error" : "ok",
    attributes: {
      "cloudgrid.fixture": true,
      "span.index": seed.index,
      "service.name": serviceName,
    },
    depth: seed.depth,
    childCount: 0,
    hasError: seed.hasError ?? false,
    isCriticalPath: seed.isCriticalPath ?? false,
    isOrphan: seed.isOrphan ?? false,
    isServiceEntry: seed.parentIndex === null || seed.index % 11 === 0,
    exceptionCount: seed.hasError ? 1 : 0,
    events: seed.hasError
      ? [
          {
            name: "exception",
            timestamp: iso(startedAtMs + Math.min(seed.durationMs, 25)),
            attributes: { "exception.type": "FixtureError" },
          },
        ]
      : [],
    links:
      seed.index > 0 && seed.index % 37 === 0
        ? [
            {
              traceId: fixtureTraceId,
              spanId: spanId(Math.max(0, seed.index - 2)),
              traceState: null,
              attributes: {},
              direction: "forward",
            },
          ]
        : [],
    exceptions: seed.hasError
      ? [
          {
            timestamp: iso(startedAtMs + Math.min(seed.durationMs, 25)),
            type: "FixtureError",
            message: "Synthetic fixture exception",
            stacktrace: "FixtureError: Synthetic fixture exception\n  at fixture.ts:1:1",
            escaped: false,
            attributes: {},
            frames: [
              {
                raw: "at fixture.ts:1:1",
                functionName: "fixture",
                fileName: "fixture.ts",
                lineNumber: 1,
                columnNumber: 1,
                language: "typescript",
              },
            ],
          },
        ]
      : [],
  };
}

function withChildCounts(spans: Span[]) {
  const childCounts = new Map<string, number>();

  for (const span of spans) {
    if (span.parentSpanId) {
      childCounts.set(span.parentSpanId, (childCounts.get(span.parentSpanId) ?? 0) + 1);
    }
  }

  return spans.map((span) => ({ ...span, childCount: childCounts.get(span.id) ?? 0 }));
}

function serviceBreakdown(spans: Span[], traceDurationMs: number): ServiceTraceBreakdown[] {
  const byService = new Map<string, ServiceTraceBreakdown>();

  for (const span of spans) {
    const serviceName = span.serviceName ?? "unknown";
    const current =
      byService.get(serviceName) ??
      ({
        serviceName,
        spanCount: 0,
        errorSpanCount: 0,
        durationMs: 0,
        percentOfTraceDuration: 0,
      } satisfies ServiceTraceBreakdown);

    current.spanCount += 1;
    current.errorSpanCount += span.hasError ? 1 : 0;
    current.durationMs += span.durationMs;
    current.percentOfTraceDuration =
      traceDurationMs > 0 ? (current.durationMs / traceDurationMs) * 100 : 0;
    byService.set(serviceName, current);
  }

  return [...byService.values()].sort((left, right) =>
    left.serviceName.localeCompare(right.serviceName),
  );
}

function relatedLogsFor(spans: Span[]): LogEvent[] {
  return spans
    .filter((span) => span.hasError || span.id.endsWith("0"))
    .slice(0, 80)
    .map((span, index) => ({
      id: `log-${index.toString().padStart(4, "0")}`,
      traceId: fixtureTraceId,
      spanId: span.id,
      serviceName: span.serviceName ?? null,
      severityText: span.hasError ? "error" : "info",
      severityNumber: span.hasError ? 17 : 9,
      body: span.hasError ? "Synthetic span failure" : "Synthetic span checkpoint",
      timestamp: span.startedAt,
      observedTimestamp: span.startedAt,
      attributes: { "cloudgrid.fixture": true },
      correlation: "span",
    }));
}

function finishTraceDetail({
  spans,
  durationMs,
  rootSpanIds,
  warnings = [],
}: {
  spans: Span[];
  durationMs: number;
  rootSpanIds: string[];
  warnings?: TraceWarning[];
}): TraceDetail {
  const countedSpans = withChildCounts(spans);
  const criticalPathSpanIds = countedSpans
    .filter((span) => span.isCriticalPath)
    .map((span) => span.id);
  const orphanSpanIds = countedSpans.filter((span) => span.isOrphan).map((span) => span.id);
  const spanMatches: SpanMatch[] = countedSpans
    .filter((span) => span.hasError || span.isCriticalPath)
    .map((span) => ({
      spanId: span.id,
      reason: span.hasError ? "error" : "criticalPath",
      fields: span.hasError ? ["status", "exception"] : ["criticalPath"],
    }));
  const logs = relatedLogsFor(countedSpans);

  return {
    trace: {
      id: fixtureTraceId,
      serviceName: countedSpans[0]?.serviceName ?? "gateway",
      startedAt: iso(baseStartedAtMs),
      endedAt: iso(baseStartedAtMs + durationMs),
      durationMs,
      rootSpanId: rootSpanIds[0] ?? null,
      status: countedSpans.some((span) => span.hasError) ? "error" : "ok",
      attributes: { "cloudgrid.fixture": true },
    },
    structure: {
      rootSpanIds,
      orphanSpanIds,
      criticalPathSpanIds,
      maxDepth: countedSpans.reduce((maxDepth, span) => Math.max(maxDepth, span.depth), 0),
      serviceBreakdown: serviceBreakdown(countedSpans, durationMs),
    },
    spans: countedSpans,
    selectedSpan: countedSpans[0] ?? null,
    spanMatches,
    logs,
    relatedLogs: logs,
    warnings,
  };
}

export function buildBalancedTraceFixture(spanCount = 200): TraceDetail {
  const spans = Array.from({ length: spanCount }, (_, index) => {
    const parentIndex = index === 0 ? null : Math.floor((index - 1) / 3);
    const parentDepth =
      parentIndex === null ? -1 : Math.floor(Math.log(parentIndex + 1) / Math.log(3));
    const depth = index === 0 ? 0 : parentDepth + 1;

    return makeSpan({
      index,
      parentIndex,
      depth,
      offsetMs: depth * 120 + (index % 17) * 11,
      durationMs: Math.max(12, 1_800 - depth * 140 - (index % 9) * 18),
      hasError: index > 0 && index % 47 === 0,
      isCriticalPath: index === 0 || index === 1 || index === 4 || index === 13 || index === 40,
    });
  });

  return finishTraceDetail({ spans, durationMs: 2_400, rootSpanIds: [spanId(0)] });
}

export function buildDeepTraceFixture(depth = 100): TraceDetail {
  const spans = Array.from({ length: depth }, (_, index) =>
    makeSpan({
      index,
      parentIndex: index === 0 ? null : index - 1,
      depth: index,
      offsetMs: index * 8,
      durationMs: Math.max(10, 1_200 - index * 9),
      hasError: index === depth - 1,
      isCriticalPath: true,
    }),
  );

  return finishTraceDetail({ spans, durationMs: 1_500, rootSpanIds: [spanId(0)] });
}

export function buildWideTraceFixture(width = 2_000): TraceDetail {
  const spans = [
    makeSpan({
      index: 0,
      parentIndex: null,
      depth: 0,
      offsetMs: 0,
      durationMs: 5_000,
      serviceName: "gateway",
      name: "gateway.root",
      isCriticalPath: true,
    }),
    ...Array.from({ length: width }, (_, siblingIndex) => {
      const index = siblingIndex + 1;

      return makeSpan({
        index,
        parentIndex: 0,
        depth: 1,
        offsetMs: 20 + (siblingIndex % 400) * 10,
        durationMs: 20 + (siblingIndex % 30),
        hasError: index % 199 === 0,
        isCriticalPath: index <= 5,
      });
    }),
  ];

  return finishTraceDetail({ spans, durationMs: 5_200, rootSpanIds: [spanId(0)] });
}

export function buildLargeTraceFixture(spanCount = 10_000): TraceDetail {
  const spans = Array.from({ length: spanCount }, (_, index) => {
    const parentIndex = index === 0 ? null : Math.floor((index - 1) / 10);
    const depth = index === 0 ? 0 : Math.floor(Math.log(index) / Math.log(10)) + 1;

    return makeSpan({
      index,
      parentIndex,
      depth,
      offsetMs: depth * 40 + (index % 1_000) * 4,
      durationMs: 8 + (index % 80),
      hasError: index > 0 && index % 941 === 0,
      isCriticalPath:
        index === 0 || index === 1 || index === 11 || index === 111 || index === 1_111,
    });
  });

  return finishTraceDetail({ spans, durationMs: 4_500, rootSpanIds: [spanId(0)] });
}

export function buildErrorHeavyTraceFixture(spanCount = 240): TraceDetail {
  const spans = Array.from({ length: spanCount }, (_, index) => {
    const parentIndex = index === 0 ? null : Math.max(0, index - 1 - (index % 4));
    const depth = index === 0 ? 0 : Math.min(8, (index % 9) + 1);

    return makeSpan({
      index,
      parentIndex,
      depth,
      offsetMs: index * 12,
      durationMs: 80 + (index % 50),
      hasError: index > 0 && index % 3 === 0,
      isCriticalPath: index < 10,
    });
  });

  return finishTraceDetail({ spans, durationMs: 3_200, rootSpanIds: [spanId(0)] });
}

export function buildOrphanTraceFixture(): TraceDetail {
  const spans = [
    makeSpan({
      index: 0,
      parentIndex: null,
      depth: 0,
      offsetMs: 0,
      durationMs: 900,
      isCriticalPath: true,
    }),
    makeSpan({
      index: 1,
      parentIndex: 0,
      depth: 1,
      offsetMs: 50,
      durationMs: 300,
      isCriticalPath: true,
    }),
    {
      ...makeSpan({
        index: 2,
        parentIndex: 9_999,
        depth: 1,
        offsetMs: 80,
        durationMs: 250,
        hasError: true,
        isOrphan: true,
      }),
      parentSpanId: "missing-parent-span",
    },
    {
      ...makeSpan({
        index: 3,
        parentIndex: 8_888,
        depth: 1,
        offsetMs: 140,
        durationMs: 120,
        isOrphan: true,
      }),
      parentSpanId: "another-missing-parent-span",
    },
  ];

  return finishTraceDetail({
    spans,
    durationMs: 1_000,
    rootSpanIds: [spanId(0)],
    warnings: [
      {
        code: "missingParent",
        message: "Synthetic trace contains spans whose parent IDs are not present.",
        spanId: spanId(2),
      },
    ],
  });
}

export function buildClockSkewTraceFixture(): TraceDetail {
  const spans = [
    makeSpan({
      index: 0,
      parentIndex: null,
      depth: 0,
      offsetMs: 200,
      durationMs: 900,
      serviceName: "gateway",
      name: "gateway.root-with-skew",
      isCriticalPath: true,
    }),
    makeSpan({
      index: 1,
      parentIndex: 0,
      depth: 1,
      offsetMs: 40,
      durationMs: 300,
      serviceName: "worker",
      name: "worker.child-started-before-parent",
      isCriticalPath: true,
    }),
    makeSpan({
      index: 2,
      parentIndex: 0,
      depth: 1,
      offsetMs: 260,
      durationMs: 120,
      serviceName: "llm-proxy",
    }),
  ];

  return finishTraceDetail({
    spans,
    durationMs: 1_200,
    rootSpanIds: [spanId(0)],
    warnings: [
      {
        code: "clockSkew",
        message: "Synthetic child span starts more than 100 ms before its parent.",
        spanId: spanId(1),
      },
    ],
  });
}
