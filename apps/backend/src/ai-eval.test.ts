import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@cloudgrid/runtime";
import type {
  AgentRun,
  AiQualityOverview,
  CreateDatasetInput,
  Dataset,
  DatasetCandidate,
  DatasetCandidateSearchResult,
  DatasetExportJob,
  DatasetImportJob,
  DatasetItem,
  EvaluationDefinition,
  EvaluationRun,
  EvaluationRunEvent,
  ExperimentRun,
  ExperimentRunEvent,
  ProjectAiSettings,
  UpdateProjectAiSettingsInput,
} from "@cloudgrid/ui-contracts";
import { parse, subscribe } from "graphql";
import {
  type BridgeMessage,
  type EphemeralPubSub,
  MessageBridgeCloudGridBridge,
  type RequestReplyClient,
} from "./bridge";
import { createAppWithBridge, createCloudGridSchema } from "./graphql";

describe("AI-eval bridge", () => {
  test("routes agent run searches through the portable request/reply adapter", async () => {
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        requests.push({ subject, payload });
        return { items: [agentRun()], nextCursor: null };
      }),
      2000,
      createLogger("bff"),
    );

    const result = await bridge.agentRuns({ agentName: "support", limit: 10 });

    expect(result.items[0]?.id).toBe("agent-run-1");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      subject: "eval.agent_runs.search",
      payload: {
        input: { agentName: "support", limit: 10 },
      },
    });
  });

  test("unwraps singular AI-eval reads from search-result bridge replies", async () => {
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        requests.push({ subject, payload });
        if (subject === "eval.agent_runs.search") {
          return { items: [agentRun()], nextCursor: null };
        }
        if (subject === "eval.dataset.search") {
          return { items: [dataset()], nextCursor: null };
        }
        return { items: [experimentRun()], nextCursor: null };
      }),
      2000,
      createLogger("bff"),
    );

    await expect(bridge.agentRun("agent-run-1")).resolves.toMatchObject({ id: "agent-run-1" });
    await expect(bridge.dataset("dataset-1")).resolves.toMatchObject({ id: "dataset-1" });
    await expect(bridge.experimentRun("experiment-run-1")).resolves.toMatchObject({
      id: "experiment-run-1",
    });

    expect(requests).toEqual([
      {
        subject: "eval.agent_runs.search",
        payload: expect.objectContaining({ input: { id: "agent-run-1" } }),
      },
      {
        subject: "eval.dataset.search",
        payload: expect.objectContaining({ input: { id: "dataset-1" } }),
      },
      {
        subject: "eval.evaluation.search",
        payload: expect.objectContaining({ input: { experimentRunId: "experiment-run-1" } }),
      },
    ]);
  });

  test("rejects invalid AI-eval bridge replies before GraphQL mapping", async () => {
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply(() => ({ items: [{ id: "agent-run-1" }], nextCursor: null })),
      2000,
      createLogger("bff"),
    );

    await expect(bridge.agentRuns({ limit: 10 })).rejects.toMatchObject({
      extensions: {
        code: "RESPONSE_CONTRACT_INVALID",
        problem: { id: "ERR-023", retryable: false },
      },
    });
  });

  test("starts and stops live experiment subscriptions through storage-read subjects", async () => {
    const subjects: string[] = [];
    let sink: ((message: BridgeMessage) => void | Promise<void>) | undefined;
    const pubSub: EphemeralPubSub = {
      async subscribe(_subject, onMessage) {
        sink = onMessage;
        return {
          async [Symbol.asyncDispose]() {
            subjects.push("disposed");
          },
        };
      },
      async publish() {},
    };
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        subjects.push(subject);
        if (subject === "eval.live.start") {
          expect(payload).toMatchObject({
            experimentRunId: "experiment-run-1",
            sinkSubject: expect.stringContaining("eval.live.events."),
          });
          queueMicrotask(() => {
            void sink?.({
              subject: "eval.live.events.bff.sub",
              data: encodeJson(experimentRunEvent()),
            });
          });
          return { subscriptionId: payload.subscriptionId };
        }
        return { subscriptionId: payload.subscriptionId };
      }),
      2000,
      createLogger("bff"),
      { bffInstanceId: "bff", pubSub, subscriptionId: () => "sub" },
    );

    const iterator = bridge.subscribeLiveExperimentRun({ experimentRunId: "experiment-run-1" });
    const first = await iterator.next();
    await iterator.return?.();

    expect(first.value).toMatchObject({ type: "progress", seq: 1 });
    expect(subjects).toEqual(["eval.live.start", "disposed", "eval.live.stop"]);
  });

  test("routes AI-eval settings and quality requests to approved subjects", async () => {
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        requests.push({ subject, payload });
        if (subject === "control.ai_settings.get" || subject === "control.ai_settings.update") {
          return { settings: projectAiSettings() };
        }
        if (subject === "eval.dataset.import.prepare" || subject === "eval.dataset.transfer.get") {
          const transferInput = payload.input as { kind?: string } | undefined;
          return transferInput?.kind === "export" ? datasetExportJob() : datasetImportJob();
        }
        if (subject === "eval.dataset.import.commit") {
          return { ...datasetImportJob(), status: "committed", committedDatasetVersion: 2 };
        }
        if (subject === "eval.dataset.export.start") {
          return datasetExportJob();
        }
        return aiQualityOverview();
      }),
      2000,
      createLogger("bff"),
    );

    await bridge.projectAiSettings("project-1");
    await bridge.aiQualityOverview({ projectId: "project-1", agentName: "support", limit: 10 });
    await bridge.updateProjectAiSettings(projectAiSettingsInput());
    await bridge.prepareDatasetImport(prepareDatasetImportInput());
    await bridge.commitDatasetImport({
      importId: "import-1",
      expectedDatasetVersionId: "dataset-version-1",
      mode: "valid_rows_only",
      idempotencyKey: "import-commit-1",
    });
    await bridge.startDatasetExport({
      datasetId: "dataset-1",
      format: "jsonl",
      split: "training",
      curationStatus: "ready",
      idempotencyKey: "export-1",
    });
    await bridge.datasetImport("import-1");
    await bridge.datasetExport("export-1");

    expect(requests.map((request) => request.subject)).toEqual([
      "control.ai_settings.get",
      "eval.results.search",
      "control.ai_settings.update",
      "eval.dataset.import.prepare",
      "eval.dataset.import.commit",
      "eval.dataset.export.start",
      "eval.dataset.transfer.get",
      "eval.dataset.transfer.get",
    ]);
    expect(requests[0]?.payload).toMatchObject({ projectId: "project-1" });
    expect(requests[1]?.payload).toMatchObject({
      input: { projectId: "project-1", agentName: "support", limit: 10 },
    });
    expect(requests[2]?.payload).toMatchObject({
      expectedVersion: 1,
      input: { projectId: "project-1", expectedVersion: 1 },
    });
    expect(requests[3]?.payload).toMatchObject({ input: prepareDatasetImportInput() });
    expect(requests[4]?.payload).toMatchObject({
      input: {
        importId: "import-1",
        expectedDatasetVersionId: "dataset-version-1",
        mode: "valid_rows_only",
        idempotencyKey: "import-commit-1",
      },
    });
    expect(requests[5]?.payload).toMatchObject({
      input: {
        datasetId: "dataset-1",
        format: "jsonl",
        split: "training",
        curationStatus: "ready",
        idempotencyKey: "export-1",
      },
    });
    expect(requests[6]?.payload).toMatchObject({ input: { id: "import-1", kind: "import" } });
    expect(requests[7]?.payload).toMatchObject({ input: { id: "export-1", kind: "export" } });
  });

  test("routes dataset candidate and idempotent run-control requests to approved subjects", async () => {
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        requests.push({ subject, payload });
        if (
          subject === "eval.dataset.candidates.search" ||
          subject === "eval.dataset.candidates.prepare"
        ) {
          return { items: [datasetCandidate()], nextCursor: null };
        }
        if (subject === "eval.dataset.candidates.commit") {
          return dataset();
        }
        return experimentRun();
      }),
      2000,
      createLogger("bff"),
    );

    await bridge.datasetCandidates({ datasetId: "dataset-1", status: "suggested", limit: 25 });
    await bridge.prepareDatasetCandidates({
      datasetId: "dataset-1",
      sources: [{ sourceKind: "trace", traceId: "trace-1", spanId: "span-1" }],
      contentTreatment: "realistic_anonymized",
      anonymizationPolicyVersion: 3,
      idempotencyKey: "candidates-prepare-1",
    });
    await bridge.commitDatasetCandidates({
      datasetId: "dataset-1",
      expectedDatasetVersionId: "dataset-version-1",
      candidateIds: ["candidate-1"],
      split: "validation",
      curationStatus: "ready",
      idempotencyKey: "candidates-commit-1",
    });
    await bridge.pauseExperimentRun("experiment-run-1");
    await bridge.resumeExperimentRun("experiment-run-1");

    expect(requests).toEqual([
      {
        subject: "eval.dataset.candidates.search",
        payload: expect.objectContaining({
          datasetId: "dataset-1",
          status: "suggested",
          limit: 25,
        }),
      },
      {
        subject: "eval.dataset.candidates.prepare",
        payload: expect.objectContaining({
          datasetId: "dataset-1",
          sources: [{ sourceKind: "trace", traceId: "trace-1", spanId: "span-1" }],
          contentTreatment: "realistic_anonymized",
          anonymizationPolicyVersion: 3,
          idempotencyKey: "candidates-prepare-1",
        }),
      },
      {
        subject: "eval.dataset.candidates.commit",
        payload: expect.objectContaining({
          datasetId: "dataset-1",
          expectedDatasetVersionId: "dataset-version-1",
          candidateIds: ["candidate-1"],
          split: "validation",
          curationStatus: "ready",
          idempotencyKey: "candidates-commit-1",
        }),
      },
      {
        subject: "eval.evaluation.run.pause",
        payload: expect.objectContaining({
          experimentRunId: "experiment-run-1",
          command: "pause",
          idempotencyKey: "experiment-run-1:pause",
        }),
      },
      {
        subject: "eval.evaluation.run.resume",
        payload: expect.objectContaining({
          experimentRunId: "experiment-run-1",
          command: "resume",
          idempotencyKey: "experiment-run-1:resume",
        }),
      },
    ]);
  });
});

describe("AI-eval GraphQL resolvers", () => {
  test("routes AI-eval queries and mutations through the bridge", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const { app } = createAppWithBridge(
      bridge({
        async agentRuns(input) {
          calls.push({ method: "agentRuns", input });
          return { items: [agentRun()], nextCursor: null };
        },
        async createDataset(input) {
          calls.push({ method: "createDataset", input });
          return dataset();
        },
        async projectAiSettings(projectId) {
          calls.push({ method: "projectAiSettings", input: projectId });
          return projectAiSettings();
        },
        async aiQualityOverview(input) {
          calls.push({ method: "aiQualityOverview", input });
          return aiQualityOverview();
        },
        async datasetCandidates(input) {
          calls.push({ method: "datasetCandidates", input });
          return { items: [datasetCandidate()], nextCursor: null };
        },
        async prepareDatasetCandidates(input) {
          calls.push({ method: "prepareDatasetCandidates", input });
          return { items: [datasetCandidate()], nextCursor: null };
        },
        async commitDatasetCandidates(input) {
          calls.push({ method: "commitDatasetCandidates", input });
          return dataset();
        },
        async pauseEvaluationRun(input) {
          calls.push({ method: "pauseEvaluationRun", input });
          return evaluationRun();
        },
        async resumeEvaluationRun(input) {
          calls.push({ method: "resumeEvaluationRun", input });
          return evaluationRun();
        },
        async updateProjectAiSettings(input) {
          calls.push({ method: "updateProjectAiSettings", input });
          return projectAiSettings();
        },
        async prepareDatasetImport(input) {
          calls.push({ method: "prepareDatasetImport", input });
          return datasetImportJob();
        },
        async commitDatasetImport(input) {
          calls.push({ method: "commitDatasetImport", input });
          return {
            ...datasetImportJob(),
            status: "committed",
            committedDatasetVersionId: "dataset-version-2",
          };
        },
        async startDatasetExport(input) {
          calls.push({ method: "startDatasetExport", input });
          return datasetExportJob();
        },
        async datasetImport(id) {
          calls.push({ method: "datasetImport", input: id });
          return datasetImportJob();
        },
        async datasetExport(id) {
          calls.push({ method: "datasetExport", input: id });
          return datasetExportJob();
        },
      }),
      {},
    );

    const queryResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query AgentRuns($input: AgentRunSearchInput) {
            agentRuns(input: $input) {
              items { id agent { name } transcript { role spanId } }
              nextCursor
            }
          }
        `,
        variables: { input: { agentName: "support", limit: 5 } },
      }),
    });
    const mutationResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation CreateDataset($input: CreateDatasetInput!) {
            createDataset(input: $input) { id name itemCount tags }
          }
        `,
        variables: {
          input: {
            projectId: "project-1",
            name: "Regression",
            tags: ["nightly"],
            settings: {
              evaluationFamily: "classification",
              inputType: "json",
              expectedType: "json",
              defaultSplit: "training",
              intakePolicy: {},
              defaultMetricSettings: [{ metricId: "exact_match" }],
              retentionProfile: "balanced",
            },
            idempotencyKey: "dataset-create-1",
          },
        },
      }),
    });
    const settingsResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query AiSettings($projectId: ID!, $quality: AiQualityOverviewInput!) {
            projectAiSettings(projectId: $projectId) { projectId enabled version }
            aiQualityOverview(input: $quality) { projectId segments { key runCount } }
          }
        `,
        variables: {
          projectId: "project-1",
          quality: { projectId: "project-1", agentName: "support", limit: 10 },
        },
      }),
    });
    const updateSettingsResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation UpdateAiSettings($input: UpdateProjectAiSettingsInput!) {
            updateProjectAiSettings(input: $input) { projectId enabled version }
          }
        `,
        variables: { input: projectAiSettingsInput() },
      }),
    });
    const candidateSearchResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query DatasetCandidates($search: DatasetCandidateSearchInput) {
            datasetCandidates(input: $search) { items { id status reason contentTreatment anonymizationProvenance { policyVersion transformedFields { entityType } } } }
          }
        `,
        variables: { search: { datasetId: "dataset-1", status: "suggested", limit: 25 } },
      }),
    });
    const candidatesResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation CandidateFlow($prepare: PrepareDatasetCandidatesInput!, $commit: CommitDatasetCandidatesInput!, $control: EvaluationRunControlInput!) {
            prepareDatasetCandidates(input: $prepare) { items { id status reason } }
            commitDatasetCandidates(input: $commit) { id itemCount health { status } }
            pauseEvaluationRun(input: $control) { id status }
            resumeEvaluationRun(input: $control) { id status }
          }
        `,
        variables: {
          prepare: {
            datasetId: "dataset-1",
            sources: [{ sourceKind: "trace", traceId: "trace-1" }],
            contentTreatment: "realistic_anonymized",
            idempotencyKey: "candidates-prepare-graphql",
          },
          commit: {
            datasetId: "dataset-1",
            expectedDatasetVersionId: "dataset-version-1",
            candidateIds: ["candidate-1"],
            idempotencyKey: "candidates-commit-graphql",
          },
          control: { evaluationRunId: "evaluation-run-1", idempotencyKey: "control-1" },
        },
      }),
    });
    const transferResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation DatasetTransfer($prepare: PrepareDatasetImportInput!, $commit: CommitDatasetImportInput!, $export: StartDatasetExportInput!) {
            prepareDatasetImport(input: $prepare) { id status validRows errorRows previewRows { rowNumber item { input split curationStatus } } }
            commitDatasetImport(input: $commit) { id status committedDatasetVersionId }
            startDatasetExport(input: $export) { id status format downloadUrl }
          }
        `,
        variables: {
          prepare: prepareDatasetImportInput(),
          commit: {
            importId: "import-1",
            expectedDatasetVersionId: "dataset-version-1",
            mode: "valid_rows_only",
            idempotencyKey: "import-commit-graphql",
          },
          export: {
            datasetId: "dataset-1",
            datasetVersionId: "dataset-version-1",
            format: "jsonl",
            idempotencyKey: "export-graphql",
          },
        },
      }),
    });
    const transferQueryResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query DatasetTransferJobs($importId: ID!, $exportId: ID!) {
            datasetImport(id: $importId) { id status validRows }
            datasetExport(id: $exportId) { id status rowCount }
          }
        `,
        variables: { importId: "import-1", exportId: "export-1" },
      }),
    });

    const queryBody = await queryResponse.json();
    const mutationBody = await mutationResponse.json();
    const settingsBody = await settingsResponse.json();
    const updateSettingsBody = await updateSettingsResponse.json();
    const candidateSearchBody = await candidateSearchResponse.json();
    const candidatesBody = await candidatesResponse.json();
    const transferBody = await transferResponse.json();
    const transferQueryBody = await transferQueryResponse.json();

    expect(queryBody.errors).toBeUndefined();
    expect(queryBody.data.agentRuns.items[0]).toMatchObject({
      id: "agent-run-1",
      agent: { name: "support" },
    });
    expect(mutationBody.errors).toBeUndefined();
    expect(mutationBody.data.createDataset).toMatchObject({
      id: "dataset-1",
      name: "Regression",
    });
    expect(settingsBody.errors).toBeUndefined();
    expect(settingsBody.data.projectAiSettings).toMatchObject({
      projectId: "project-1",
      enabled: true,
    });
    expect(settingsBody.data.aiQualityOverview.segments[0]).toMatchObject({
      key: "agent:support",
      runCount: 12,
    });
    expect(updateSettingsBody.errors).toBeUndefined();
    expect(updateSettingsBody.data.updateProjectAiSettings).toMatchObject({
      projectId: "project-1",
      enabled: true,
    });
    expect(candidateSearchBody.errors).toBeUndefined();
    expect(candidateSearchBody.data.datasetCandidates.items[0]).toMatchObject({
      id: "candidate-1",
      status: "suggested",
      contentTreatment: "realistic_anonymized",
    });
    expect(candidatesBody.errors).toBeUndefined();
    expect(candidatesBody.data.commitDatasetCandidates).toMatchObject({
      id: "dataset-1",
      itemCount: 0,
    });
    expect(candidatesBody.data.pauseEvaluationRun).toMatchObject({ id: "evaluation-run-1" });
    expect(candidatesBody.data.resumeEvaluationRun).toMatchObject({ id: "evaluation-run-1" });
    expect(transferBody.errors).toBeUndefined();
    expect(transferBody.data.prepareDatasetImport).toMatchObject({
      id: "import-1",
      status: "preview_ready",
      validRows: 1,
      errorRows: 0,
    });
    expect(transferBody.data.commitDatasetImport).toMatchObject({
      id: "import-1",
      status: "committed",
      committedDatasetVersionId: "dataset-version-2",
    });
    expect(transferBody.data.startDatasetExport).toMatchObject({
      id: "export-1",
      status: "ready",
      downloadUrl: "/api/ai-eval/dataset-exports/export-1/download",
    });
    expect(transferQueryBody.errors).toBeUndefined();
    expect(transferQueryBody.data.datasetImport).toMatchObject({ id: "import-1" });
    expect(transferQueryBody.data.datasetExport).toMatchObject({ id: "export-1" });
    expect(calls).toMatchObject([
      { method: "agentRuns", input: { agentName: "support", limit: 5 } },
      {
        method: "createDataset",
        input: { name: "Regression", tags: ["nightly"] },
      },
      { method: "projectAiSettings", input: "project-1" },
      {
        method: "aiQualityOverview",
        input: { projectId: "project-1", agentName: "support", limit: 10 },
      },
      { method: "updateProjectAiSettings", input: projectAiSettingsInput() },
      {
        method: "datasetCandidates",
        input: { datasetId: "dataset-1", status: "suggested", limit: 25 },
      },
      {
        method: "prepareDatasetCandidates",
        input: {
          datasetId: "dataset-1",
          sources: [{ sourceKind: "trace", traceId: "trace-1" }],
          contentTreatment: "realistic_anonymized",
          curationStatus: "needs_review",
          idempotencyKey: "candidates-prepare-graphql",
        },
      },
      {
        method: "commitDatasetCandidates",
        input: {
          datasetId: "dataset-1",
          expectedDatasetVersionId: "dataset-version-1",
          candidateIds: ["candidate-1"],
          idempotencyKey: "candidates-commit-graphql",
        },
      },
      {
        method: "pauseEvaluationRun",
        input: { evaluationRunId: "evaluation-run-1", idempotencyKey: "control-1" },
      },
      {
        method: "resumeEvaluationRun",
        input: { evaluationRunId: "evaluation-run-1", idempotencyKey: "control-1" },
      },
      {
        method: "prepareDatasetImport",
        input: {
          ...prepareDatasetImportInput(),
          mapping: { ...prepareDatasetImportInput().mapping, metadata: [] },
          defaults: {
            ...prepareDatasetImportInput().defaults,
            metadata: {},
            allowPartialCommit: false,
          },
        },
      },
      {
        method: "commitDatasetImport",
        input: {
          importId: "import-1",
          expectedDatasetVersionId: "dataset-version-1",
          mode: "valid_rows_only",
          idempotencyKey: "import-commit-graphql",
        },
      },
      {
        method: "startDatasetExport",
        input: {
          datasetId: "dataset-1",
          datasetVersionId: "dataset-version-1",
          format: "jsonl",
          includeMetadata: true,
          includeSourcePointers: true,
          idempotencyKey: "export-graphql",
        },
      },
      { method: "datasetImport", input: "import-1" },
      { method: "datasetExport", input: "export-1" },
    ]);
  });

  test("liveEvaluationRun validates input and streams bridge events", async () => {
    let receivedInput: { evaluationRunId: string } | undefined;
    const result = await subscribe({
      schema: createCloudGridSchema(),
      document: parse(`
        subscription Live($input: LiveEvaluationRunInput!) {
          liveEvaluationRun(input: $input) {
            type
            seq
            receivedAt
            run { id status }
          }
        }
      `),
      variableValues: { input: { evaluationRunId: "evaluation-run-1" } },
      contextValue: {
        hono: {
          get: () =>
            bridge({
              subscribeLiveEvaluationRun(input) {
                receivedInput = input;
                return (async function* () {
                  yield evaluationRunEvent();
                })();
              },
            }),
        },
        requestId: "req-live-eval",
        logger: createLogger("bff"),
      },
    });

    if (!Symbol.asyncIterator || !(Symbol.asyncIterator in result)) {
      throw new Error("expected async iterable subscription result");
    }
    const first = await result.next();
    await result.return?.();

    if (first.done) {
      throw new Error("expected live evaluation event");
    }
    expect(first.value.data?.liveEvaluationRun).toMatchObject({
      type: "progress",
      seq: 1,
      run: { id: "evaluation-run-1", status: "running" },
    });
    expect(receivedInput).toEqual({ evaluationRunId: "evaluation-run-1" });
  });
});

describe("AI-eval dataset transfer HTTP endpoints", () => {
  test("stages upload bytes and streams ready export artifacts without bridge dataset mutation", async () => {
    const transferDir = join(import.meta.dir, "..", ".tmp-ai-eval-transfer-test");
    rmSync(transferDir, { recursive: true, force: true });
    mkdirSync(join(transferDir, "exports"), { recursive: true });

    const artifact = "export-1.jsonl";
    writeFileSync(
      join(transferDir, "exports", "export-1.json"),
      JSON.stringify({
        exportId: "export-1",
        projectId: "project-1",
        filename: artifact,
        format: "jsonl",
        status: "ready",
        sizeBytes: 12,
        sha256: "sha",
        createdAt: new Date("2026-05-16T10:00:00Z").toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    writeFileSync(join(transferDir, "exports", artifact), '{"a":1}\n');

    const calls: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async appendDatasetItems() {
          calls.push("appendDatasetItems");
          return dataset();
        },
      }),
      { datasetTransferDir: transferDir },
    );

    const form = new FormData();
    form.set("projectId", "project-1");
    form.set("file", new File(['{"prompt":"hi"}\n'], "items.jsonl", { type: "application/jsonl" }));

    const uploadResponse = await app.request("/api/ai-eval/dataset-imports/uploads", {
      method: "POST",
      body: form,
    });
    const uploadBody = await uploadResponse.json();

    expect(uploadResponse.status).toBe(200);
    expect(uploadBody).toMatchObject({
      projectId: "project-1",
      filename: "items.jsonl",
      sizeBytes: 16,
      detectedFormat: "jsonl",
    });
    expect(uploadBody.uploadId).toBeString();
    expect(uploadBody.sha256).toBeString();

    const downloadResponse = await app.request("/api/ai-eval/dataset-exports/export-1/download");
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toContain("application/jsonl");
    expect(await downloadResponse.text()).toBe('{"a":1}\n');
    expect(calls).toEqual([]);

    rmSync(transferDir, { recursive: true, force: true });
  });

  test("rejects unsafe ZIP uploads before staging bytes", async () => {
    const transferDir = join(import.meta.dir, "..", ".tmp-ai-eval-transfer-zip-test");
    rmSync(transferDir, { recursive: true, force: true });
    const { app } = createAppWithBridge(bridge(), { datasetTransferDir: transferDir });

    const form = new FormData();
    form.set("projectId", "project-1");
    form.set(
      "file",
      new File([unsafeZipBytes("../escape.jsonl")], "items.zip", { type: "application/zip" }),
    );

    const response = await app.request("/api/ai-eval/dataset-imports/uploads", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_FAILED",
    });
    rmSync(transferDir, { recursive: true, force: true });
  });
});

function unsafeZipBytes(name: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const filename = encoder.encode(name);
  const buffer = new ArrayBuffer(30 + filename.byteLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(26, filename.byteLength, true);
  bytes.set(filename, 30);
  return buffer;
}

function requestReply(
  handle: (subject: string, payload: Record<string, unknown>) => unknown,
): RequestReplyClient {
  return {
    async request(subject, payload) {
      const decoded = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
      return encodeJson({
        requestId: decoded.requestId,
        ok: true,
        data: handle(subject, decoded),
      });
    },
  };
}

function bridge(
  overrides: Partial<InstanceType<typeof MessageBridgeCloudGridBridge>> = {},
): InstanceType<typeof MessageBridgeCloudGridBridge> {
  return {
    async agentRuns() {
      return { items: [], nextCursor: null };
    },
    async agentRun() {
      return null;
    },
    async datasets() {
      return { items: [], nextCursor: null };
    },
    async dataset() {
      return null;
    },
    async datasetImport() {
      return null;
    },
    async datasetExport() {
      return null;
    },
    async datasetItems() {
      return { items: [], nextCursor: null };
    },
    async scorers() {
      return { items: [], nextCursor: null };
    },
    async experiments() {
      return { items: [], nextCursor: null };
    },
    async experimentRun() {
      return null;
    },
    async experimentRuns() {
      return { items: [], nextCursor: null };
    },
    async datasetItemRuns() {
      return { items: [], nextCursor: null };
    },
    async evalResults() {
      return { items: [], nextCursor: null };
    },
    async evaluationDefinitions() {
      return { items: [], nextCursor: null };
    },
    async evaluationDefinition() {
      return null;
    },
    async evaluationRuns() {
      return { items: [], nextCursor: null };
    },
    async evaluationRun() {
      return evaluationRun();
    },
    async evaluationItemRuns() {
      return { items: [], nextCursor: null };
    },
    async evaluationResults() {
      return { items: [], nextCursor: null };
    },
    async evaluationComparisons() {
      return { items: [], nextCursor: null };
    },
    async evaluationComparison() {
      return null;
    },
    async optimizationRuns() {
      return { items: [], nextCursor: null };
    },
    async optimizationRun() {
      return optimizationRun();
    },
    async targetSnapshot() {
      return null;
    },
    async targetDiff() {
      return {
        baselineTargetSnapshotId: "snapshot-1",
        candidateTargetSnapshotId: "snapshot-2",
        changedParts: [],
        summary: "",
      };
    },
    async annotationQueue() {
      return { items: [], nextCursor: null };
    },
    async projectAiSettings() {
      return projectAiSettings();
    },
    async aiQualityOverview() {
      return aiQualityOverview();
    },
    async datasetCandidates(): Promise<DatasetCandidateSearchResult> {
      return { items: [], nextCursor: null };
    },
    async prepareDatasetCandidates(): Promise<DatasetCandidateSearchResult> {
      return { items: [], nextCursor: null };
    },
    async commitDatasetCandidates() {
      return dataset();
    },
    async createDataset(_input: CreateDatasetInput) {
      return dataset();
    },
    async appendDatasetItems() {
      return dataset();
    },
    async prepareDatasetImport() {
      return datasetImportJob();
    },
    async commitDatasetImport() {
      return { ...datasetImportJob(), status: "committed", committedDatasetVersion: 2 };
    },
    async startDatasetExport() {
      return datasetExportJob();
    },
    async promoteSpanToDatasetItem() {
      return datasetItem();
    },
    async createScorer() {
      return {
        id: "scorer-1",
        name: "Exact",
        kind: "deterministic",
        definition: {},
        version: 1,
      };
    },
    async createEvaluationDefinition() {
      return evaluationDefinition();
    },
    async updateEvaluationDefinition() {
      return evaluationDefinition();
    },
    async createExperiment() {
      return {
        id: "experiment-1",
        name: "Regression",
        datasetId: "dataset-1",
        datasetVersion: 1,
        metricIds: ["exact_match"],
        createdAt: "2026-05-12T10:00:00.000Z",
        tags: [],
      };
    },
    async startExperimentRun() {
      return experimentRun();
    },
    async startEvaluationRun() {
      return evaluationRun();
    },
    async cancelExperimentRun() {
      return experimentRun();
    },
    async cancelEvaluationRun() {
      return evaluationRun();
    },
    async pauseExperimentRun() {
      return experimentRun();
    },
    async pauseEvaluationRun() {
      return evaluationRun();
    },
    async resumeExperimentRun() {
      return experimentRun();
    },
    async resumeEvaluationRun() {
      return evaluationRun();
    },
    async startOptimizationRun() {
      return optimizationRun();
    },
    async createEvaluationComparison() {
      return {
        id: "comparison-1",
        projectId: "project-1",
        baselineRunId: "evaluation-run-1",
        candidateRunId: "evaluation-run-2",
        metricResults: [],
        metricAggregates: [],
        summary: "",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async promotePromptVersion() {
      return {
        id: "prompt-version-1",
        name: "base",
        text: "Hello",
        hash: "hash",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async promoteTargetSnapshot() {
      return {
        id: "promotion-1",
        projectId: "project-1",
        targetRef: "prompt:base",
        baselineTargetSnapshotId: "snapshot-1",
        candidateTargetSnapshotId: "snapshot-2",
        evidenceEvaluationRunIds: [],
        comparisonId: "comparison-1",
        summary: "",
        promotedBy: "user-1",
        promotedAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async resolveAnnotation() {
      return {
        id: "annotation-1",
        targetTraceId: "trace-1",
        reason: "failed",
        status: "resolved",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async updateProjectAiSettings() {
      return projectAiSettings();
    },
    subscribeLiveExperimentRun() {
      return liveExperimentEvents([]);
    },
    async *subscribeLiveEvaluationRun() {
      yield evaluationRunEvent();
    },
    async searchTraces() {
      return { items: [], nextCursor: null };
    },
    async getTraceDetail() {
      return null;
    },
    async searchLogs() {
      return { items: [], nextCursor: null };
    },
    async telemetryFacets() {
      return { services: [], operations: [], spanNames: [], severities: [], attributeKeys: [] };
    },
    subscribeLiveTraces() {
      return liveTraceEvents([]);
    },
    async health() {
      return "ok" as const;
    },
    async close() {},
    ...overrides,
  } as InstanceType<typeof MessageBridgeCloudGridBridge>;
}

async function* liveExperimentEvents(
  events: ExperimentRunEvent[],
): AsyncIterableIterator<ExperimentRunEvent> {
  for (const event of events) {
    yield event;
  }
}

async function* liveTraceEvents(_events: never[] = []): AsyncIterableIterator<never> {}

function agentRun(): AgentRun {
  return {
    id: "agent-run-1",
    traceId: "trace-1",
    rootSpanId: "span-1",
    agent: { name: "support" },
    status: "ok",
    startedAt: "2026-05-12T10:00:00.000Z",
    transcript: [{ role: "user", spanId: "span-1" }],
    llmCalls: [],
    toolCalls: [],
    retrievalEvents: [],
    evalResults: [],
  };
}

function dataset(): Dataset {
  const settings = {
    evaluationFamily: "classification" as const,
    inputType: "json" as const,
    expectedType: "json" as const,
    inputJsonSchema: {},
    expectedJsonSchema: {},
    defaultSplit: "validation" as const,
    intakePolicy: {
      manualDefaultStatus: "draft" as const,
      importDefaultStatus: "needs_review" as const,
      traceDefaultStatus: "needs_expected" as const,
    },
    traceExtractionSettings: null,
    anonymizationPolicy: null,
    defaultMetricSettings: [],
    retentionProfile: "balanced" as const,
  };
  return {
    id: "dataset-1",
    projectId: "project-1",
    name: "Regression",
    description: null,
    currentVersionId: "dataset-version-1",
    currentVersion: {
      id: "dataset-version-1",
      datasetId: "dataset-1",
      version: 1,
      digest: "digest-1",
      itemRevisionIds: [],
      settingsSnapshot: settings,
      changeSummary: "Initial dataset version",
      source: "manual",
      createdAt: "2026-05-12T10:00:00.000Z",
      createdBy: "user-1",
    },
    settings,
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedBy: "user-1",
    itemCount: 0,
    readyItemCount: 0,
    splitCounts: {},
    health: {
      status: "needs_review",
      readyItemCount: 0,
      totalItemCount: 0,
      splitCounts: {},
      duplicateCandidateCount: 0,
      leakageWarningCount: 0,
      missingExpectedCount: 0,
      schemaIssueCount: 0,
      smallDataset: true,
      warnings: [],
    },
    tags: ["nightly"],
  };
}

function datasetItem(): DatasetItem {
  return {
    id: "dataset-item-1",
    datasetId: "dataset-1",
    latestRevisionId: "dataset-item-revision-1",
    latestRevision: {
      id: "dataset-item-revision-1",
      datasetItemId: "dataset-item-1",
      datasetId: "dataset-1",
      input: {},
      expected: null,
      observedOutput: null,
      reason: "",
      metadata: {},
      sourceRefs: [],
      split: "training",
      curationStatus: "draft",
      contentTreatment: "original",
      anonymizationProvenance: null,
      createdAt: "2026-05-12T10:00:00.000Z",
      createdBy: "user-1",
      updatedAt: "2026-05-12T10:00:00.000Z",
      updatedBy: "user-1",
    },
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedBy: "user-1",
  };
}

function datasetCandidate(): DatasetCandidate {
  return {
    id: "candidate-1",
    datasetId: "dataset-1",
    status: "suggested",
    sourceKind: "trace",
    source: { traceId: "trace-1", spanId: "span-1" },
    targetShape: "single_turn",
    input: { prompt: "How should checkout fail gracefully?" },
    expected: { answer: "Show a retryable payment error." },
    metadata: { service: "checkout" },
    split: "validation",
    reviewStatus: "draft",
    contentTreatment: "realistic_anonymized",
    anonymization: {
      policyId: "default-realistic",
      policyVersion: 3,
      transformedAt: "2026-05-12T10:01:00.000Z",
      consistencyScope: "dataset",
      transformedFields: [{ path: "$.customer.email", entityType: "email", strategy: "replace" }],
    },
    reason: "failed production measurement",
    clusterId: "cluster-1",
    warnings: [],
    createdAt: "2026-05-12T10:00:00.000Z",
    updatedAt: "2026-05-12T10:05:00.000Z",
  };
}

function experimentRun(): ExperimentRun {
  return {
    id: "experiment-run-1",
    experimentId: "experiment-1",
    solverRef: { kind: "agent", name: "candidate" },
    status: "running",
    runPolicy: { maxParallelRequests: 10 },
    startedAt: "2026-05-12T10:00:00.000Z",
    summary: emptyExperimentRunSummary(),
  };
}

function evaluationDefinition(): EvaluationDefinition {
  return {
    id: "evaluation-definition-1",
    projectId: "project-1",
    name: "Regression",
    datasetId: "dataset-1",
    datasetVersionPolicy: "latest_ready",
    splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
    targetRef: { kind: "prompt", displayName: "Prompt", metadata: {} },
    metricSettings: [],
    runPolicy: { maxParallelRequests: 10 },
    retentionProfile: "balanced",
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedBy: "user-1",
    version: 1,
  };
}

function evaluationRun(): EvaluationRun {
  return {
    id: "evaluation-run-1",
    projectId: "project-1",
    evaluationDefinitionId: "evaluation-definition-1",
    kind: "dataset_evaluation",
    status: "running",
    datasetId: "dataset-1",
    datasetVersionId: "dataset-version-1",
    datasetDigest: "digest",
    selectedItemRevisionIds: [],
    splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
    targetSnapshotId: "target-snapshot-1",
    metricSettingsSnapshot: [],
    runPolicySnapshot: { maxParallelRequests: 10 },
    retentionProfile: "balanced",
    retentionRole: "validation",
    startedAt: "2026-05-12T10:00:00.000Z",
    summary: {
      itemCounts: {},
      metricAggregates: [],
      problemCounts: {},
      budgetUsage: {},
      latency: null,
    },
    metricResults: [],
    metricAggregates: [],
  };
}

function optimizationRun() {
  return {
    id: "optimization-run-1",
    projectId: "project-1",
    status: "running" as const,
    baselineTargetSnapshotId: "target-snapshot-1",
    objective: { primaryMetricId: "exact_match" },
    candidateTargetSnapshotIds: [],
    causedEvaluationRunIds: [],
    comparisonIds: [],
    budgetSnapshot: {},
    createdAt: "2026-05-12T10:00:00.000Z",
    startedAt: "2026-05-12T10:00:00.000Z",
  };
}

function evaluationRunEvent(): EvaluationRunEvent {
  return {
    type: "progress",
    seq: 1,
    receivedAt: "2026-05-12T10:00:01.000Z",
    run: evaluationRun(),
  };
}

function emptyExperimentRunSummary(): ExperimentRun["summary"] {
  return {
    itemCounts: {
      total: 0,
      passed: 0,
      failed: 0,
      errored: 0,
      skipped: 0,
      needsReview: 0,
      quarantined: 0,
    },
    scoreSummaries: [],
    problemCounts: {
      modelQuality: 0,
      itemQuality: 0,
      scorerConfig: 0,
      infrastructure: 0,
    },
    budgetUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedUsd: 0,
    },
    latency: null,
    regressions: [],
  };
}

function experimentRunEvent(): ExperimentRunEvent {
  return {
    type: "progress",
    seq: 1,
    receivedAt: "2026-05-12T10:00:01.000Z",
    run: experimentRun(),
  };
}

function projectAiSettings(): ProjectAiSettings {
  return {
    projectId: "project-1",
    enabled: true,
    defaultProviderProfileId: "provider-1",
    defaultJudgeProfileId: "provider-1",
    defaultOptimizerProfileId: null,
    defaultEmbeddingProfileId: null,
    providerProfiles: [
      {
        id: "provider-1",
        projectId: "project-1",
        label: "Harness",
        providerKind: "local_harness",
        models: {},
        timeoutMs: 30000,
      },
    ],
    modelAliases: [
      {
        id: "alias-1",
        name: "judge",
        providerProfileId: "provider-1",
        model: "judge-model",
        purpose: "judge",
        parameters: {},
      },
    ],
    onlinePolicies: [
      {
        id: "policy-1",
        enabled: true,
        name: "Production quality",
        target: {},
        metricIds: ["exact_match"],
        sampleRate: 0.1,
        contentAllowance: ["captured_content"],
        maxLatencyClass: "batch",
        annotationRules: [],
        updatedAt: "2026-05-12T10:00:00.000Z",
        updatedByUserId: "user-1",
      },
    ],
    budget: {
      dailyUsd: 10,
      deterministicOnly: false,
      spentTodayUsd: 0,
    },
    sampling: {
      defaultOnlineSampleRate: 0.1,
      maxOnlineSampleRate: 1,
      maxConcurrentEvaluationItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    runPolicyDefaults: { maxParallelRequests: 10 },
    datasetPipeline: {
      candidateSuggestionsEnabled: true,
      requireReviewBeforeCommit: true,
      anonymizationMode: "realistic",
      anonymizationPolicyId: null,
      anonymizationPolicyVersion: null,
      anonymizationConsistencyScope: "project",
      preserveLocale: true,
      preserveTemporalDistance: true,
      blockedEntityTypes: [],
    },
    datasetDefaults: {
      splitAllocation: {},
      smallDatasetReadyThreshold: 30,
      requireReadyForTest: true,
    },
    effective: {
      warnings: [],
      deterministicOnly: false,
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      budgetExhausted: false,
    },
    version: 1,
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedByUserId: "user-1",
  };
}

function projectAiSettingsInput(): UpdateProjectAiSettingsInput {
  return {
    projectId: "project-1",
    enabled: true,
    defaultProviderProfileId: "provider-1",
    defaultJudgeProfileId: "provider-1",
    providerProfiles: [
      {
        id: "provider-1",
        label: "Harness",
        providerKind: "local_harness",
        models: {},
        timeoutMs: 30000,
        disabled: false,
      },
    ],
    modelAliases: [],
    onlinePolicies: [],
    budget: {
      dailyUsd: 10,
      deterministicOnly: false,
    },
    sampling: {
      defaultOnlineSampleRate: 0.1,
      maxOnlineSampleRate: 1,
      maxConcurrentEvaluationItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    datasetDefaults: {
      splitAllocation: {},
      smallDatasetReadyThreshold: 30,
      requireReadyForTest: true,
    },
    expectedVersion: 1,
  };
}

function aiQualityOverview(): AiQualityOverview {
  return {
    projectId: "project-1",
    summary: {},
    segments: [
      {
        key: "agent:support",
        label: "support",
        dimensions: { agentName: "support" },
        runCount: 12,
        scoredRunCount: 10,
        passRate: 0.9,
        meanScore: 0.82,
        regressionCount: 1,
      },
    ],
    warnings: [],
  };
}

function prepareDatasetImportInput() {
  return {
    datasetId: "dataset-1",
    uploadId: "upload-1",
    format: "jsonl" as const,
    mapping: {
      input: [{ targetPath: "prompt", source: { jsonPath: "$.prompt" } }],
      expected: [{ targetPath: "answer", source: { jsonPath: "$.answer" } }],
    },
    defaults: { split: "training" as const, curationStatus: "draft" as const },
    previewLimit: 10,
    idempotencyKey: "import-prepare-1",
  };
}

function datasetImportJob(): DatasetImportJob {
  return {
    id: "import-1",
    datasetId: "dataset-1",
    status: "preview_ready",
    format: "jsonl",
    sourceFiles: [
      {
        path: "items.jsonl",
        format: "jsonl",
        sizeBytes: 32,
        rowCount: 1,
        sha256: "sha",
      },
    ],
    mapping: prepareDatasetImportInput().mapping,
    defaults: prepareDatasetImportInput().defaults,
    previewRows: [
      {
        rowNumber: 1,
        filePath: "items.jsonl",
        item: {
          input: { prompt: "hi" },
          expected: { answer: "hello" },
          reason: "",
          metadata: {},
          split: "training",
          curationStatus: "draft",
          sourceRefs: [],
        },
        errors: [],
        warnings: [],
      },
    ],
    totalRows: 1,
    validRows: 1,
    errorRows: 0,
    warnings: [],
    createdAt: "2026-05-16T10:00:00.000Z",
    expiresAt: "2026-05-17T10:00:00.000Z",
  };
}

function datasetExportJob(): DatasetExportJob {
  return {
    id: "export-1",
    datasetId: "dataset-1",
    datasetVersion: 1,
    status: "ready",
    format: "jsonl",
    rowCount: 1,
    sizeBytes: 64,
    sha256: "sha",
    downloadUrl: "/api/ai-eval/dataset-exports/export-1/download",
    createdAt: "2026-05-16T10:00:00.000Z",
    expiresAt: "2026-05-17T10:00:00.000Z",
  };
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
