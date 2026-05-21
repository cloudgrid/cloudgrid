import { describe, expect, test } from "bun:test";
import {
  AI_EVAL_SEARCH_DEFAULT_LIMIT,
  AI_EVAL_SEARCH_HARD_LIMIT,
  buildAgentRunSearchInput,
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
      experimentRunId: null,
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
      experimentRunId: null,
      query: null,
      limit: AI_EVAL_SEARCH_DEFAULT_LIMIT,
      cursor: null,
    });
  });
});
