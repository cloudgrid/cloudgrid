import { describe, expect, test } from "bun:test";
import {
  AI_CHAT_ACTIONS,
  AI_CHAT_BUDGETS,
  AI_CHAT_MODEL_ALIASES,
  AI_CHAT_RENDERERS,
  AI_CHAT_SKILLS,
  AI_CHAT_TOOLS,
} from "./ai-chat/catalog";

describe("AI Chat runtime catalog", () => {
  test("exports the required model aliases from the implementation contract", () => {
    expect(Object.keys(AI_CHAT_MODEL_ALIASES).sort()).toEqual([
      "chat_reasoning",
      "embedding",
      "rerank",
      "structured_reasoning",
    ]);
    expect(AI_CHAT_MODEL_ALIASES.chat_reasoning.capabilities).toEqual(["text_stream", "tool_use"]);
  });

  test("contains the approved tools, renderers, actions, skills, and budgets", () => {
    expect(AI_CHAT_TOOLS.map((tool) => tool.id)).toEqual([
      "telemetry.searchTraces",
      "telemetry.getTrace",
      "telemetry.searchLogs",
      "telemetry.queryMetrics",
      "telemetry.getFacets",
      "dashboards.list",
      "alerts.list",
      "alerts.history",
      "aiEval.searchAgentRuns",
      "aiEval.searchDatasets",
      "aiEval.searchScorers",
      "aiEval.searchExperiments",
      "aiEval.searchEvalResults",
      "project.get",
      "analysis.summarizeTrace",
      "analysis.summarizeLogs",
      "analysis.summarizeMetrics",
      "analysis.summarizeAiEval",
      "sandbox.writeDataFile",
      "sandbox.readFile",
      "sandbox.writeScript",
      "sandbox.runScript",
      "sandbox.listFiles",
      "render.emitJsonRender",
      "action.propose",
      "conversation.compact",
    ]);
    expect(AI_CHAT_RENDERERS.map((renderer) => renderer.key)).toEqual([
      "metric_timeseries",
      "metric_bar",
      "table",
      "key_value",
      "trace_waterfall",
      "log_list",
      "mermaid",
      "json_tree",
      "diff",
      "status_summary",
      "action_approval",
    ]);
    expect(AI_CHAT_ACTIONS.map((action) => action.kind)).toContain("dataset.items_append");
    expect(AI_CHAT_ACTIONS.map((action) => action.kind)).not.toContain("dataset.item.append");
    expect(AI_CHAT_SKILLS.map((skill) => skill.name)).toEqual([
      "cloudgrid-trace-investigation",
      "cloudgrid-logs-investigation",
      "cloudgrid-metrics-investigation",
      "cloudgrid-ai-eval-investigation",
      "cloudgrid-json-render-artifacts",
    ]);
    expect(AI_CHAT_BUDGETS).toMatchObject({
      maxToolCallsPerRun: 24,
      maxJsonRenderArtifactsPerRun: 12,
      inlineToolResultMaxBytes: 65_536,
      renderSpecMaxBytes: 524_288,
      sandboxScriptWallClockMs: 15_000,
    });
  });

  test("tool status payloads are derived from safe catalog labels only", () => {
    const traceTool = AI_CHAT_TOOLS.find((tool) => tool.id === "telemetry.searchTraces");
    expect(traceTool?.streamLabel).toBe("Searching traces");
    expect(traceTool?.modelInputSchema.required).not.toContain("companyId");
    expect(traceTool?.modelInputSchema.required).not.toContain("projectId");
    expect(traceTool?.injectedFields).toEqual([
      "companyId",
      "projectId",
      "userId",
      "conversationId",
      "authContext",
    ]);
  });
});
