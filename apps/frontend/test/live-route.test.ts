import { describe, expect, test } from "bun:test";
import type { LiveTraceEvent } from "@cloudgrid/ui-contracts";
import {
  applyLiveTraceEvent,
  createLiveTraceInputFromSearchParams,
  liveTraceSubscriptionKey,
} from "../src/routes/live-route";

const baseTrace = {
  id: "trace-1",
  serviceName: "checkout",
  startedAt: "2026-05-10T12:00:00.000Z",
  endedAt: "2026-05-10T12:00:01.000Z",
  durationMs: 1000,
  rootSpanId: "span-1",
  status: "ok" as const,
  attributes: {},
  spanCount: 3,
  errorSpanCount: 0,
  logCount: 1,
  serviceCount: 1,
};

function event(id: string, seq: number): LiveTraceEvent {
  return {
    type: "added",
    seq,
    receivedAt: `2026-05-10T12:00:0${seq}.000Z`,
    trace: {
      ...baseTrace,
      id,
    },
  };
}

describe("live trace route helpers", () => {
  test("keeps live event buffer bounded by the requested limit", () => {
    const first = applyLiveTraceEvent([], event("trace-1", 1), 2, false);
    const second = applyLiveTraceEvent(first, event("trace-2", 2), 2, false);
    const third = applyLiveTraceEvent(second, event("trace-3", 3), 2, false);

    expect(third.map((row) => row.trace.id)).toEqual(["trace-3", "trace-2"]);
  });

  test("does not append new events while rendering is paused", () => {
    const existing = applyLiveTraceEvent([], event("trace-1", 1), 100, false);
    const paused = applyLiveTraceEvent(existing, event("trace-2", 2), 100, true);

    expect(paused.map((row) => row.trace.id)).toEqual(["trace-1"]);
  });

  test("normalizes live filter variables for stable subscription restarts", () => {
    const params = new URLSearchParams({
      service: " checkout ",
      query: "  ",
      operationName: "POST /orders",
      minDurationMs: "25",
      maxDurationMs: "bad",
      status: "error",
      limit: "999",
      paused: "true",
    });

    const input = createLiveTraceInputFromSearchParams(params);

    expect(input).toEqual({
      service: "checkout",
      query: null,
      operationName: "POST /orders",
      spanName: null,
      from: null,
      status: "error",
      minDurationMs: 25,
      maxDurationMs: null,
      attributes: null,
      limit: 500,
    });
    expect(liveTraceSubscriptionKey(input)).toBe(
      'LiveTrace:{"attributes":null,"from":null,"limit":500,"maxDurationMs":null,"minDurationMs":25,"operationName":"POST /orders","query":null,"service":"checkout","spanName":null,"status":"error"}',
    );
  });

  test("changes subscription identity only when server filter variables change", () => {
    const current = createLiveTraceInputFromSearchParams(
      new URLSearchParams("service=checkout&paused=true"),
    );
    const nextPaused = createLiveTraceInputFromSearchParams(
      new URLSearchParams("service=checkout"),
    );
    const nextFilter = createLiveTraceInputFromSearchParams(new URLSearchParams("service=billing"));

    expect(liveTraceSubscriptionKey(nextPaused)).toBe(liveTraceSubscriptionKey(current));
    expect(liveTraceSubscriptionKey(nextFilter)).not.toBe(liveTraceSubscriptionKey(current));
  });
});
