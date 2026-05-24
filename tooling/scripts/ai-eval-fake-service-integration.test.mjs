import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import {
  aiEvalV2ScenarioOperationNames,
  runAiEvalV2FakeAdapterScenario,
} from "../../apps/packages/integration-scenarios/src/index.ts";

let server;
let endpoint;
const calls = [];

beforeAll(async () => {
  server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/graphql") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    calls.push({ operationName: body.operationName, variables: body.variables });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: fakeGraphQLData(body.operationName) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  endpoint = `http://127.0.0.1:${address.port}/graphql`;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("AI Eval v2 fake-service integration", () => {
  test("covers dataset evaluation, result reads, comparison, optimization, and harness trace context", async () => {
    calls.length = 0;

    const result = await runAiEvalV2FakeAdapterScenario({
      projectId: "project-1",
      runId: "fake-service",
      graphql: {
        async request(operationName, variables) {
          return requestGraphQL(operationName, variables);
        },
      },
      async readHarnessCapturedRequests() {
        return [
          {
            method: "POST",
            path: "/v1/run",
            traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
            body: { evaluationRunId: "evaluation-run-1" },
          },
        ];
      },
    });

    expect(result).toMatchObject({
      datasetId: "dataset-1",
      datasetVersionId: "dataset-version-2",
      evaluationDefinitionId: "evaluation-definition-1",
      evaluationRunId: "evaluation-run-1",
      comparisonId: "comparison-1",
      optimizationRunId: "optimization-1",
      harnessTraceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
    expect(calls.map((call) => call.operationName)).toEqual(aiEvalV2ScenarioOperationNames());
    const staleNames = [
      "Start" + "ExperimentRun",
      "Pause" + "ExperimentRun",
      "Resume" + "ExperimentRun",
      "Cancel" + "ExperimentRun",
      "Prepare" + "DatasetCandidates",
      "Dataset" + "Candidates",
      "Commit" + "DatasetCandidates",
      "AiQuality" + "Overview",
      "Annotation" + "Queue",
    ];
    for (const staleName of staleNames) {
      expect(JSON.stringify(calls)).not.toContain(staleName);
    }
  });
});

async function requestGraphQL(operationName, variables) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName, variables }),
  });
  const body = await response.json();
  return body.data;
}

function fakeGraphQLData(operationName) {
  if (operationName === "CreateDataset") {
    return { createDataset: dataset("dataset-version-1") };
  }
  if (operationName === "AppendDatasetItems") {
    return { appendDatasetItems: dataset("dataset-version-2") };
  }
  if (operationName === "CreateEvaluationDefinition") {
    return { createEvaluationDefinition: { id: "evaluation-definition-1" } };
  }
  if (operationName === "StartEvaluationRun") {
    return { startEvaluationRun: { id: "evaluation-run-1" } };
  }
  if (operationName === "EvaluationRun") {
    return { evaluationRun: { id: "evaluation-run-1", status: "completed" } };
  }
  if (operationName === "EvaluationResults") {
    return {
      evaluationResults: {
        items: [
          {
            id: "metric-result-1",
            metricId: "classification.exact_label_match",
            payload: { kind: "boolean", booleanValue: true },
          },
        ],
        nextCursor: null,
      },
    };
  }
  if (operationName === "CreateEvaluationComparison") {
    return { createEvaluationComparison: { id: "comparison-1" } };
  }
  if (operationName === "StartOptimizationRun") {
    return { startOptimizationRun: { id: "optimization-1", status: "running" } };
  }
  if (operationName === "OptimizationRuns") {
    return { optimizationRuns: { items: [{ id: "optimization-1" }], nextCursor: null } };
  }
  throw new Error(`Unhandled fake GraphQL operation ${operationName}`);
}

function dataset(currentVersionId) {
  return {
    id: "dataset-1",
    currentVersionId,
  };
}
