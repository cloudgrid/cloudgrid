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

  test("records bounded request metadata for scenario assertions", async () => {
    const server = createHarnessAdapterServer({ captureRequests: true });

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
    expect(server.capturedRequests()).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/v1/run",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "vendor=value",
        body: expect.objectContaining({
          experimentRunId: "run-1",
          datasetItemId: "item-1",
        }),
      }),
    ]);
  });

  test("POST /v1/run exposes deterministic validation-failure and timeout fixture modes", async () => {
    const validationServer = createHarnessAdapterServer({
      fixtureMode: "validation_failure",
    });
    const validationResponse = await validationServer.fetch(
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
    expect(validationResponse.status).toBe(422);
    expect(await readJson(validationResponse)).toMatchObject({
      code: "EVAL_OUTPUT_VALIDATION_FAILED",
      retryable: false,
    });

    const timeoutServer = createHarnessAdapterServer({ fixtureMode: "timeout" });
    const timeoutResponse = await timeoutServer.fetch(
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
    expect(timeoutResponse.status).toBe(504);
    expect(await readJson(timeoutResponse)).toMatchObject({
      code: "EVAL_ADAPTER_TIMEOUT",
      retryable: true,
    });
  });

  test("sandbox lifecycle endpoints expose adapter-switchable control calls", async () => {
    const server = createHarnessAdapterServer();

    const start = await server.fetch(
      new Request("http://adapter.test/v1/sandboxes/start", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-1",
          datasetItemId: "item-1",
          manifestDigest: "manifest-digest-1",
          sandboxProfile: "ephemeral_eval_item",
          runPolicy: { maxParallelRequests: 10 },
        }),
      }),
    );

    expect(start.status).toBe(200);
    const started = (await readJson(start)) as { sandboxRef: string; checkpointSupported: boolean };
    expect(started).toMatchObject({
      sandboxRef: "sandbox-run-1-item-1",
      sandboxProfile: "ephemeral_eval_item",
      checkpointSupported: false,
      cleanupRequired: true,
    });

    for (const action of ["pause", "resume", "abort", "cleanup"]) {
      const response = await server.fetch(
        new Request(`http://adapter.test/v1/sandboxes/${action}`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            experimentRunId: "run-1",
            datasetItemId: "item-1",
            manifestDigest: "manifest-digest-1",
            sandboxProfile: "ephemeral_eval_item",
            sandboxRef: started.sandboxRef,
            cleanupRetry:
              action === "cleanup" ? { attempt: 2, reason: "unknown_outcome" } : undefined,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        sandboxRef: started.sandboxRef,
        checkpointSupported: false,
        ...(action === "cleanup"
          ? {
              cleanupSummary: {
                status: "acknowledged",
                retryable: false,
                deletedBytes: 0,
                deletedFiles: 0,
              },
            }
          : {}),
      });
    }
  });

  test("sandbox lifecycle rejects invalid policy and disables durable replay checkpoints for v1", async () => {
    const server = createHarnessAdapterServer();

    const invalidPolicy = await server.fetch(
      new Request("http://adapter.test/v1/sandboxes/start", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-1",
          manifestDigest: "manifest-digest-1",
          sandboxProfile: "ephemeral_eval_item",
          runPolicy: { maxParallelRequests: 0 },
        }),
      }),
    );
    expect(invalidPolicy.status).toBe(400);
    expect(await readJson(invalidPolicy)).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
    });

    const durable = await server.fetch(
      new Request("http://adapter.test/v1/sandboxes/start", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-1",
          manifestDigest: "manifest-digest-1",
          sandboxProfile: "durable_replay_workspace",
          checkpointRef: "checkpoint-secret-ref",
          runPolicy: { maxParallelRequests: 1 },
        }),
      }),
    );
    expect(durable.status).toBe(200);
    expect(await readJson(durable)).toMatchObject({
      checkpointSupported: false,
      warnings: ["durable replay workspace is disabled for AI Eval v1"],
    });
  });

  test("cleanup responses are bounded and redacted", async () => {
    const server = createHarnessAdapterServer();

    const response = await server.fetch(
      new Request("http://adapter.test/v1/sandboxes/cleanup", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-1",
          manifestDigest: "manifest-digest-1",
          sandboxProfile: "ephemeral_eval_item",
          sandboxRef: "sandbox-run-1-item-1",
          cleanupRetry: {
            attempt: 1,
            hostPath: "/Users/sebastianwessel/.cloudgrid/secret-workspace",
            authorization: "Bearer secret",
            prompt: "raw prompt must not echo",
            providerRequestBody: { apiKey: "sk-secret" },
            natsSubject: "eval.results.persist",
            surrealUrl: "surrealdb://secret",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("cleanupSummary");
    expect(text).not.toContain("/Users/sebastianwessel");
    expect(text).not.toContain("Bearer secret");
    expect(text).not.toContain("raw prompt");
    expect(text).not.toContain("sk-secret");
    expect(text).not.toContain("surrealdb://");
    expect(text).not.toContain("eval.results.persist");
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

  test("POST /v1/optimize emits quick-shot candidate events from fixture mode", async () => {
    const server = createHarnessAdapterServer({ fixtureMode: "quick_shot" });

    const response = await server.fetch(
      new Request("http://adapter.test/v1/optimize", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          experimentRunId: "run-1",
          experimentId: "evaluation-1",
          manifestDigest: "manifest-digest-1",
          optimizerKind: "critic_mutate_judge_pick",
          basePromptVersion: {
            id: "target-snapshot-1",
            name: "Baseline target",
            text: "Classify the input.",
            hash: "sha256:baseline",
          },
          config: { maxCandidates: 2 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "candidate",
      summary: {
        retentionRole: "quick_shot",
        evaluatedSubset: true,
      },
    });
    expect(events[2]).toMatchObject({
      type: "summary",
      summary: {
        retentionRole: "quick_shot",
        candidateCount: 2,
      },
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
          optimizerKind: "bootstrap_fewshot",
          manifestDigest: "manifest-digest-1",
          sandboxProfile: "ephemeral_optimization_candidate",
          sandboxRef: "sandbox-run-optimizer-1-candidate-1",
          runPolicy: { maxParallelRequests: 1 },
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

  test("skill capabilities advertise deterministic skill text edit support", async () => {
    const server = createHarnessAdapterServer();

    const response = await server.fetch(new Request("http://adapter.test/capabilities"));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      supportedOptimizerKinds: expect.arrayContaining(["skill_text_edit"]),
      runtimeModes: expect.arrayContaining(["managed_harness", "external_business_context"]),
      editablePartKinds: ["skill"],
      packageFormats: ["agent_skill_package"],
      traceExport: {
        supported: true,
        requiredForSkillOptimization: true,
      },
      editOps: expect.arrayContaining(["append", "insert_after", "replace", "delete"]),
    });
  });

  test("skill runtime dry-run validates package manifest readiness", async () => {
    const server = createHarnessAdapterServer();

    const response = await server.fetch(
      new Request("http://adapter.test/skill-runtime/dry-run", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          runtimeMode: "managed_harness",
          modelProfileRef: "model-profile-local",
          skillPackage: deterministicSkillPackage(),
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      optimizationRunId: "optimization-1",
      ok: true,
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: "skill.entrypoint",
          status: "passed",
        }),
        expect.objectContaining({
          id: "runtime.trace-export",
          status: "passed",
        }),
      ]),
    });
  });

  test("skill runtime dry-run reports failed package readiness without secrets", async () => {
    const server = createHarnessAdapterServer();
    const skillPackage = deterministicSkillPackage();

    const response = await server.fetch(
      new Request("http://adapter.test/skill-runtime/dry-run", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          runtimeMode: "external_business_context",
          skillPackage: {
            ...skillPackage,
            files: skillPackage.files.filter((file) => file.path !== "SKILL.md"),
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    const text = await response.text();
    expect(text).toContain("\"ok\":false");
    expect(text).toContain("SKILL.md is missing");
    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("Bearer ");
  });

  test("skill reflection returns invalid protected edit and valid package edit proposals", async () => {
    const server = createHarnessAdapterServer({ fixtureMode: "skill_text_edit" });

    const response = await server.fetch(
      new Request("http://adapter.test/skill-optimization/reflect", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          stepId: "step-1",
          reflectionKind: "failure",
          skillPackage: deterministicSkillPackage(),
          evidence: [
            {
              itemRunId: "train-001",
              split: "training",
              actualOutput: "Asked for too many irrelevant details.",
              expected: "Ask only for account id.",
              importantSteps: [{ kind: "gen_ai", summary: "agent missed account id" }],
              trajectorySummary: "The skill handled the topic but missed escalation criteria.",
              traceRefs: [{ traceId: "trace-001" }],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await readJson(response)) as {
      proposals: Array<{
        expectedValidity: string;
        protectedFileViolation: boolean;
        edits: Array<{ filePath: string }>;
      }>;
    };
    expect(payload.proposals).toHaveLength(2);
    expect(payload.proposals[0]).toMatchObject({
      expectedValidity: "invalid_protected_file",
      protectedFileViolation: true,
      edits: [expect.objectContaining({ filePath: "scripts/run.sh" })],
    });
    expect(payload.proposals[1]).toMatchObject({
      expectedValidity: "valid",
      protectedFileViolation: false,
      edits: [
        expect.objectContaining({ filePath: "SKILL.md" }),
        expect.objectContaining({ filePath: "references/escalation.md" }),
      ],
    });
  });

  test("skill merge-rank, slow-update, and meta-memory responses are deterministic", async () => {
    const server = createHarnessAdapterServer({ fixtureMode: "skill_text_edit" });
    const reflect = await server.fetch(
      new Request("http://adapter.test/skill-optimization/reflect", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          stepId: "step-1",
          reflectionKind: "failure",
          skillPackage: deterministicSkillPackage(),
          evidence: [],
        }),
      }),
    );
    const reflected = (await readJson(reflect)) as { proposals: unknown[] };

    const mergeRank = await server.fetch(
      new Request("http://adapter.test/skill-optimization/merge-rank", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          stepId: "step-1",
          editBudget: 1,
          proposals: reflected.proposals,
        }),
      }),
    );
    expect(mergeRank.status).toBe(200);
    expect(await readJson(mergeRank)).toMatchObject({
      rankedProposals: [
        expect.objectContaining({
          expectedValidity: "valid",
          protectedFileViolation: false,
        }),
      ],
      droppedProposalIds: expect.arrayContaining(["skill-edit-optimization-1-protected-runtime"]),
    });

    const slowUpdate = await server.fetch(
      new Request("http://adapter.test/skill-optimization/slow-update", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          epoch: 1,
          acceptedProposalIds: ["skill-edit-optimization-1-skill-and-reference"],
          rejectedProposalIds: ["skill-edit-optimization-1-protected-runtime"],
        }),
      }),
    );
    expect(slowUpdate.status).toBe(200);
    expect(await readJson(slowUpdate)).toMatchObject({
      protectedGuidance: true,
      guidance: expect.arrayContaining([
        expect.stringContaining("preserve successful behavior"),
      ]),
    });

    const metaMemory = await server.fetch(
      new Request("http://adapter.test/skill-optimization/meta-memory", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          optimizationRunId: "optimization-1",
          currentMemory: [{ id: "memory-existing", summary: "keep concise" }],
          acceptedProposalIds: ["skill-edit-optimization-1-skill-and-reference"],
          rejectedProposalIds: ["skill-edit-optimization-1-protected-runtime"],
        }),
      }),
    );
    expect(metaMemory.status).toBe(200);
    expect(await readJson(metaMemory)).toMatchObject({
      memory: expect.arrayContaining([
        expect.objectContaining({ id: "memory-existing" }),
        expect.objectContaining({
          kind: "rejected_edit_pattern",
          summary: "Do not edit protected runtime or dependency files.",
        }),
      ]),
    });
  });
});

function deterministicSkillPackage() {
  return {
    packageRef: "skill-package-deterministic-support",
    entrypoint: "SKILL.md",
    manifestDigest: "sha256:deterministic-skill-manifest",
    editableFileGlobs: ["SKILL.md", "references/*.md"],
    protectedFileGlobs: ["scripts/**", "package-lock.json"],
    runtimeRequirements: {
      requiresMcp: false,
      requiresFilesystem: false,
    },
    files: [
      {
        path: "SKILL.md",
        role: "entrypoint",
        digest: "sha256:skill-md",
        byteSize: 640,
        editable: true,
        content: "# Support Triage Skill\n",
      },
      {
        path: "references/escalation.md",
        role: "reference",
        digest: "sha256:reference-escalation",
        byteSize: 360,
        editable: true,
        content: "# Escalation\n",
      },
      {
        path: "scripts/run.sh",
        role: "script",
        digest: "sha256:script-run",
        byteSize: 120,
        editable: false,
      },
    ],
  };
}
