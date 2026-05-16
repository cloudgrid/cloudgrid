import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dir, "../src/routes/ai-eval-route.tsx"), "utf8");

describe("AI Eval route UX migration", () => {
  test("uses URL selected state and avoids route-primary Card surfaces", () => {
    expect(routeSource).not.toContain("../components/ui/card");
    expect(routeSource).toContain('searchParams.get("run")');
    expect(routeSource).toContain('searchParams.get("dataset")');
    expect(routeSource).toContain('searchParams.get("scorer")');
    expect(routeSource).toContain('searchParams.get("experiment")');
    expect(routeSource).toContain('searchParams.get("annotation")');
  });

  test("keeps route frame, left rail tabs, main workspace, and right inspector shape", () => {
    expect(routeSource).toContain("ai-eval-left-rail");
    expect(routeSource).toContain("ai-eval-main-workspace");
    expect(routeSource).toContain("ai-eval-right-inspector");
  });

  test("covers all approved AI Eval sections and settings link without local telemetry truth", () => {
    for (const section of [
      "overview",
      "runs",
      "datasets",
      "scorers",
      "experiments",
      "optimizations",
      "production",
      "annotations",
    ]) {
      expect(routeSource).toContain(`value="${section}"`);
    }
    expect(routeSource).toContain("/settings/ai-eval");
    expect(routeSource).toContain("projectAiSettings(projectId: $projectId)");
    expect(routeSource).toContain("aiQualityOverview(input: $input)");
    expect(routeSource).not.toContain("localStorage");
  });
});
