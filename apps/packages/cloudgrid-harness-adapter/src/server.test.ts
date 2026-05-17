import { describe, expect, test } from "bun:test";
import { createHarnessAdapterServer } from "./server";

const jsonHeaders = { "content-type": "application/json" };

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

describe("cloudgrid harness adapter server", () => {
  test("GET /healthz reports healthy adapter status", async () => {
    const server = createHarnessAdapterServer();

    const response = await server.fetch(new Request("http://adapter.test/healthz"));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      service: "cloudgrid-harness-adapter",
      version: "1.0.0",
    });
  });

  test("POST /v1/run validates required contract fields", async () => {
    const server = createHarnessAdapterServer();

    const invalidResponse = await server.fetch(
      new Request("http://adapter.test/v1/run", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ datasetItemId: "item-1" }),
      }),
    );

    expect(invalidResponse.status).toBe(400);
    expect(await readJson(invalidResponse)).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    const validResponse = await server.fetch(
      new Request("http://adapter.test/v1/run", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-1",
          datasetItemId: "item-1",
          solverRef: { kind: "agent", id: "agent-local" },
          input: { prompt: "hello" },
        }),
      }),
    );

    expect(validResponse.status).toBe(200);
    expect(await readJson(validResponse)).toMatchObject({
      experimentRunId: "run-1",
      datasetItemId: "item-1",
      harnessRunId: "harness-run-1-item-1",
      output: { prompt: "hello" },
    });
  });

  test("POST /v1/run emits an OTLP span preserving incoming trace context", async () => {
    const otlpRequests: Request[] = [];
    const server = createHarnessAdapterServer({
      otlp: {
        endpoint: "http://collector.test/v1/traces",
        fetch: async (request: Request) => {
          otlpRequests.push(request);
          return new Response("{}", { status: 200 });
        },
      },
    });

    const response = await server.fetch(
      new Request("http://adapter.test/v1/run", {
        method: "POST",
        headers: {
          ...jsonHeaders,
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
          tracestate: "vendor=value",
        },
        body: JSON.stringify({
          experimentRunId: "run-1",
          datasetItemId: "item-1",
          solverRef: { kind: "agent", id: "agent-local" },
          input: { prompt: "hello" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(otlpRequests).toHaveLength(1);

    const payload = (await otlpRequests[0]?.json()) as {
      resourceSpans: Array<{
        scopeSpans: Array<{
          spans: Array<Record<string, unknown>>;
        }>;
      }>;
    };
    const span = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(span).toBeDefined();
    expect(span).toMatchObject({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      parentSpanId: "00f067aa0ba902b7",
      name: "cloudgrid.harness_adapter.run",
    });
    expect(span?.traceState).toBe("vendor=value");
  });

  test("POST /v1/score executes deterministic contains and regex scorers", async () => {
    const server = createHarnessAdapterServer();

    const containsResponse = await server.fetch(
      new Request("http://adapter.test/v1/score", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          scorer: {
            id: "contains-helpful",
            name: "Contains helpful",
            kind: "deterministic",
            version: 2,
            definition: { type: "contains", value: "helpful" },
          },
          target: {
            kind: "datasetItemRun",
            id: "item-run-1",
            output: "This answer is helpful.",
          },
        }),
      }),
    );

    expect(containsResponse.status).toBe(200);
    expect(await readJson(containsResponse)).toMatchObject({
      scorerId: "contains-helpful",
      scorerVersion: 2,
      targetKind: "datasetItemRun",
      targetId: "item-run-1",
      score: 1,
      passed: true,
    });

    const regexResponse = await server.fetch(
      new Request("http://adapter.test/v1/score", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          scorer: {
            id: "regex-ticket",
            name: "Mentions ticket",
            kind: "deterministic",
            version: 1,
            definition: { type: "regex", pattern: "CG-[0-9]+" },
          },
          target: {
            kind: "datasetItemRun",
            id: "item-run-2",
            output: { text: "fixed in CG-42" },
          },
        }),
      }),
    );

    expect(regexResponse.status).toBe(200);
    expect(await readJson(regexResponse)).toMatchObject({
      scorerId: "regex-ticket",
      score: 1,
      passed: true,
    });
  });

  test("POST /v1/optimize streams candidate and summary NDJSON", async () => {
    const server = createHarnessAdapterServer();

    const response = await server.fetch(
      new Request("http://adapter.test/v1/optimize", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-optimizer-1",
          experimentId: "experiment-1",
          optimizerKind: "bootstrap-fewshot",
          basePromptVersion: {
            id: "prompt-1",
            name: "Base",
            text: "Answer clearly.",
            hash: "hash-base",
          },
          config: { maxCandidates: 1 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");

    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      type: "candidate",
      experimentRunId: "run-optimizer-1",
      promptVersion: {
        name: "Base candidate 1",
      },
    });
    expect(lines[1]).toMatchObject({
      type: "summary",
      experimentRunId: "run-optimizer-1",
      summary: {
        candidateCount: 1,
      },
    });
  });
});
