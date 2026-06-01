import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..", "..");

const sourceFiles = [
  "apps/frontend/src/routes/traces-route.tsx",
  "apps/frontend/src/features/traces/trace-detail-view.tsx",
  "apps/frontend/src/features/traces/trace-table.tsx",
  "apps/frontend/src/routes/dashboards-route.tsx",
  "apps/frontend/src/features/dashboards/widget-renderers/alert-widget-renderers.tsx",
  "apps/frontend/src/features/ai-eval/workspace.tsx",
];

const untranslatedCopy = [
  'aria-label="Move widget"',
  'aria-label="Resize widget"',
  'aria-label="Select all visible traces"',
  "<DialogTitle>Prepare dataset rows</DialogTitle>",
  ">Selected trace candidates<",
  ">Selected evidence<",
  ">Matching datasets<",
  ">Open datasets<",
  ">Preview rows<",
  ">matching alert events<",
  "<TableHead>Created</TableHead>",
  '<SummaryRow label="Rule">',
  "<TableHead>Name</TableHead>",
  "<TableHead>Evaluation type</TableHead>",
  "<DialogTitle>Import rows</DialogTitle>",
  "<DialogTitle>Export dataset</DialogTitle>",
  ">New dataset<",
  ">New evaluation<",
  ">Start optimization<",
  'aria-label="Pause evaluation run"',
  'aria-label="Resume evaluation run"',
  'aria-label="Cancel evaluation run"',
];

describe("frontend visible copy", () => {
  test("known route and feature strings use translation keys", () => {
    const offenders = sourceFiles.flatMap((sourceFile) => {
      const source = readFileSync(join(repoRoot, sourceFile), "utf8");
      return untranslatedCopy
        .filter((needle) => source.includes(needle))
        .map((needle) => `${sourceFile}: ${needle}`);
    });

    expect(offenders).toEqual([]);
  });
});
