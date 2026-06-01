import { describe, expect, test } from "bun:test";
import {
  AI_EVAL_SEARCH_DEFAULT_LIMIT,
  AI_EVAL_SEARCH_HARD_LIMIT,
  buildAgentRunSearchInput,
  buildAiQualityOverviewInput,
  buildDatasetSearchInput,
  buildExperimentSearchInput,
  buildScorerSearchInput,
} from "../src/ai-eval-query";

describe("shared AI Eval query contracts", () => {
  test("builds agent run search input for UI routes and AI tool calls", () => {
    expect(AI_EVAL_SEARCH_DEFAULT_LIMIT).toBe(50);
    expect(AI_EVAL_SEARCH_HARD_LIMIT).toBe(200);
    expect(
      buildAgentRunSearchInput({
        agentName: "support",
        status: "error",
        from: "2026-05-20T17:08:43.000Z",
        to: "2026-05-21T17:08:43.000Z",
        query: "checkout",
        limit: 500,
      }),
    ).toEqual({
      agentId: null,
      agentName: "support",
      status: "error",
      from: "2026-05-20T17:08:43.000Z",
      to: "2026-05-21T17:08:43.000Z",
      evaluationRunId: null,
      query: "checkout",
      limit: AI_EVAL_SEARCH_HARD_LIMIT,
      cursor: null,
    });
    expect(buildAgentRunSearchInput({ agentName: " ", status: "bad", limit: null })).toEqual({
      agentId: null,
      agentName: null,
      status: null,
      from: null,
      to: null,
      evaluationRunId: null,
      query: null,
      limit: AI_EVAL_SEARCH_DEFAULT_LIMIT,
      cursor: null,
    });
  });

  test("builds AI Eval route search inputs with shared defaults", () => {
    expect(buildDatasetSearchInput({ query: "regression", limit: 25 })).toEqual({
      query: "regression",
      tag: null,
      split: null,
      curationStatus: null,
      limit: 25,
      cursor: null,
    });
    expect(buildScorerSearchInput({ kind: "deterministic", query: "exact", limit: 500 })).toEqual({
      kind: "deterministic",
      query: "exact",
      limit: AI_EVAL_SEARCH_HARD_LIMIT,
      cursor: null,
    });
    expect(buildExperimentSearchInput({ status: "running", query: "checkout" })).toEqual({
      datasetId: null,
      status: "running",
      split: null,
      baselineRunId: null,
      query: "checkout",
      limit: AI_EVAL_SEARCH_DEFAULT_LIMIT,
      cursor: null,
    });
  });

  test("builds production quality input with required project scope", () => {
    expect(
      buildAiQualityOverviewInput({
        projectId: "project-1",
        agentName: "support",
        service: "checkout",
        limit: 500,
      }),
    ).toEqual({
      projectId: "project-1",
      from: null,
      to: null,
      agentName: "support",
      environment: null,
      service: "checkout",
      route: null,
      toolName: null,
      model: null,
      policyId: null,
      scorerId: null,
      limit: AI_EVAL_SEARCH_HARD_LIMIT,
    });
  });
});
