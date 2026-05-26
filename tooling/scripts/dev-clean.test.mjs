import { describe, expect, test } from "bun:test";
import { isInsideRepo, plannedSignalSteps, shouldKillProcess } from "./dev-clean.mjs";

describe("dev-clean helpers", () => {
  test("only targets processes whose cwd is inside the repository by default", () => {
    expect(
      shouldKillProcess({
        cwd: "/repo/apps/frontend",
        repoRoot: "/repo",
        force: false,
      }),
    ).toBe(true);
    expect(
      shouldKillProcess({
        cwd: "/other",
        repoRoot: "/repo",
        force: false,
      }),
    ).toBe(false);
  });

  test("force mode targets any process on a configured dev port", () => {
    expect(
      shouldKillProcess({
        cwd: "/other",
        repoRoot: "/repo",
        force: true,
      }),
    ).toBe(true);
  });

  test("repo containment does not treat sibling paths as children", () => {
    expect(isInsideRepo("/repo-other/apps/frontend", "/repo")).toBe(false);
    expect(isInsideRepo("/repo/apps/frontend", "/repo")).toBe(true);
  });

  test("planned signal steps use graceful termination before force kill", () => {
    expect(plannedSignalSteps()).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
