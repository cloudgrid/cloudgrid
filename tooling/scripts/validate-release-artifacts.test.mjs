import { describe, expect, test } from "bun:test";
import { validateReleaseArtifacts } from "./validate-release-artifacts.mjs";

describe("release artifact validation", () => {
  test("release artifacts satisfy CloudGrid production distribution boundaries", async () => {
    const result = await validateReleaseArtifacts(new URL("../..", import.meta.url).pathname);
    expect(result.errors).toEqual([]);
  });
});
