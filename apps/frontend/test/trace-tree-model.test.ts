import { expect, test } from "bun:test";
import type { Span } from "@cloudgrid/ui-contracts";
import {
  buildTraceTreeIndexes,
  expandSelectedSpanPath,
  getSpanDurationPercent,
  getSpanStartOffsetPercent,
} from "../src/features/traces/trace-tree-model";

function span(overrides: Partial<Span>): Span {
  return {
    id: "span-1",
    traceId: "trace-1",
    parentSpanId: null,
    name: "work",
    kind: "INTERNAL",
    serviceName: "api",
    startedAt: "2026-05-08T10:00:00.000Z",
    startedAtUnixNano: "1778234400000000000",
    endedAt: "2026-05-08T10:00:00.001Z",
    endedAtUnixNano: "1778234400001000000",
    startOffsetNano: "0",
    durationNano: "1000000",
    durationMs: 1,
    status: "ok",
    attributes: {},
    depth: 0,
    childCount: 0,
    hasError: false,
    isCriticalPath: false,
    isOrphan: false,
    isServiceEntry: true,
    exceptionCount: 0,
    events: [],
    links: [],
    exceptions: [],
    ...overrides,
  };
}

test("trace tree waterfall prefers Unix nanoseconds over same-second ISO timestamps", () => {
  const first = span({
    id: "first",
    startedAt: "2026-05-08T10:00:00Z",
    startedAtUnixNano: "1778234400000000000",
    endedAt: "2026-05-08T10:00:00Z",
    endedAtUnixNano: "1778234400000100000",
    durationNano: "100000",
    durationMs: 0.1,
  });
  const second = span({
    id: "second",
    startedAt: "2026-05-08T10:00:00Z",
    startedAtUnixNano: "1778234400000500000",
    endedAt: "2026-05-08T10:00:00Z",
    endedAtUnixNano: "1778234400000700000",
    durationNano: "200000",
    durationMs: 0.2,
  });
  const indexes = buildTraceTreeIndexes({
    spans: [second, first],
    traceStartedAt: "2026-05-08T10:00:00Z",
    traceStartedAtUnixNano: "1778234400000000000",
    traceDurationNano: "1000000",
    traceDurationMs: 1,
  });

  expect(indexes.rootSpanIds).toEqual(["first", "second"]);
  expect(getSpanStartOffsetPercent(indexes, first)).toBe(0);
  expect(getSpanStartOffsetPercent(indexes, second)).toBe(50);
  expect(getSpanDurationPercent(indexes, second)).toBe(20);
});

test("trace tree expansion adds only the selected span path", () => {
  const root = span({ id: "root" });
  const child = span({ id: "child", parentSpanId: "root" });
  const leaf = span({ id: "leaf", parentSpanId: "child" });
  const indexes = buildTraceTreeIndexes({
    spans: [root, child, leaf],
    traceStartedAt: "2026-05-08T10:00:00Z",
    traceDurationMs: 10,
  });

  const expanded = expandSelectedSpanPath(new Set(["unrelated"]), indexes, "leaf");

  expect([...expanded].sort()).toEqual(["child", "root", "unrelated"]);
});
