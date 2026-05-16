import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const srcDir = join(import.meta.dir, "../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
  });
}

describe("code block discipline", () => {
  test("route and feature code uses the shared Shiki-backed CodeBlock for snippets", () => {
    const violations = sourceFiles(srcDir).flatMap((path) => {
      const rel = relative(srcDir, path);
      if (rel === "components/code-block.tsx") {
        return [];
      }
      const source = readFileSync(path, "utf8");
      return source.includes("<pre") ? [`${rel}: raw pre element`] : [];
    });

    expect(violations).toEqual([]);
  });

  test("shared CodeBlock supports CloudGrid setup and structured evidence languages", () => {
    const source = readFileSync(join(srcDir, "components/code-block.tsx"), "utf8");

    expect(source).toContain('type CodeLanguage = "bash" | "json" | "log" | "yaml"');
    expect(source).toContain('import("@shikijs/langs/bash")');
    expect(source).toContain('import("@shikijs/langs/yaml")');
    expect(source).toContain("codeToTokens");
  });
});
