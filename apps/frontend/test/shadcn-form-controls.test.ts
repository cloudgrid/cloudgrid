import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const srcDir = join(import.meta.dir, "../src");
const allowedPrimitiveFiles = new Set([
  "components/ui/input.tsx",
  "components/ui/textarea.tsx",
  "components/ui/button.tsx",
  "components/ui/table.tsx",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
  });
}

function findOpeningTagEnd(source: string, start: number) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === ">" && source[index - 1] !== "=") {
      return index;
    }
  }
  return -1;
}

describe("shadcn form control discipline", () => {
  test("route and feature code does not use native form controls or raw buttons", () => {
    const violations = sourceFiles(srcDir).flatMap((path) => {
      const rel = relative(srcDir, path);
      if (allowedPrimitiveFiles.has(rel)) {
        return [];
      }
      const source = readFileSync(path, "utf8");
      return [
        source.includes("native-select") ? `${rel}: native-select import` : null,
        source.includes("<select") ? `${rel}: native select` : null,
        source.includes("<option") ? `${rel}: native option` : null,
        source.includes("<textarea") ? `${rel}: native textarea` : null,
        source.includes("<button") ? `${rel}: native button` : null,
        source.includes('type="checkbox"') || source.includes("type='checkbox'")
          ? `${rel}: native checkbox`
          : null,
      ].filter((violation): violation is string => violation !== null);
    });

    expect(violations).toEqual([]);
  });

  test("product buttons include icons and copy actions stay icon-only", () => {
    const violations = sourceFiles(srcDir).flatMap((path) => {
      const rel = relative(srcDir, path);
      if (allowedPrimitiveFiles.has(rel)) {
        return [];
      }
      const source = readFileSync(path, "utf8");
      const fileViolations: string[] = [];
      let index = 0;

      while (index < source.length) {
        const buttonIndex = source.indexOf("<Button", index);
        if (buttonIndex === -1) {
          break;
        }
        index = buttonIndex;
        const line = source.slice(0, index).split("\n").length;
        const openEnd = findOpeningTagEnd(source, index);
        if (openEnd === -1) {
          break;
        }
        const openingTag = source.slice(index, openEnd + 1);
        if (/\/\s*>$/.test(openingTag)) {
          index = openEnd + 1;
          continue;
        }
        const close = source.indexOf("</Button>", openEnd);
        if (close === -1) {
          index = openEnd + 1;
          continue;
        }
        const body = source.slice(openEnd + 1, close);
        const iconOnly = /size="icon(?:-[a-z]+)?"/.test(openingTag);
        const hasIcon =
          iconOnly ||
          body.includes("data-icon") ||
          body.includes("aria-hidden") ||
          body.includes("{icon}") ||
          /<([A-Z][A-Za-z0-9]*)(\s|>|\/)/.test(body);

        if (!hasIcon) {
          fileViolations.push(`${rel}:${line}: button has no icon`);
        }

        const visibleCopyLabel =
          />\s*Copy\s*</.test(body) ||
          /Copy endpoint/.test(body) ||
          /t\(["']actions\.copy["']\)/.test(body);
        if (visibleCopyLabel && !iconOnly) {
          fileViolations.push(`${rel}:${line}: copy action must be icon-only`);
        }

        index = close + "</Button>".length;
      }

      return fileViolations;
    });

    expect(violations).toEqual([]);
  });

  test("search fields use the shared shadcn search input", () => {
    const violations = sourceFiles(srcDir).flatMap((path) => {
      const rel = relative(srcDir, path);
      if (rel === "components/search-input.tsx" || allowedPrimitiveFiles.has(rel)) {
        return [];
      }
      const source = readFileSync(path, "utf8");
      return [
        source.includes('type="search"') ? `${rel}: raw search input` : null,
        /<Search[\s\S]{0,240}absolute[\s\S]{0,240}<Input/.test(source)
          ? `${rel}: ad hoc search icon input`
          : null,
      ].filter((violation): violation is string => violation !== null);
    });

    expect(violations).toEqual([]);
  });

  test("shared actionable primitives expose correct cursor affordances", () => {
    const requiredPointers = [
      "components/ui/button.tsx",
      "components/ui/select.tsx",
      "components/ui/dropdown-menu.tsx",
      "components/ui/command.tsx",
      "components/ui/tabs.tsx",
      "components/ui/checkbox.tsx",
      "components/ui/toggle.tsx",
      "components/ui/accordion.tsx",
      "components/ui/navigation-menu.tsx",
      "components/ui/dialog.tsx",
      "components/ui/sheet.tsx",
      "components/ui/popover.tsx",
      "components/ui/collapsible.tsx",
    ];

    const violations = requiredPointers.flatMap((rel) => {
      const source = readFileSync(join(srcDir, rel), "utf8");
      return [
        source.includes("cursor-pointer") ? null : `${rel}: missing cursor-pointer`,
        source.includes("cursor-not-allowed") ? null : `${rel}: missing disabled cursor`,
        source.includes("disabled:pointer-events-none")
          ? `${rel}: disabled pointer events hide cursor feedback`
          : null,
        source.includes("data-[disabled]:pointer-events-none") ||
        source.includes("data-[disabled=true]:pointer-events-none")
          ? `${rel}: data-disabled pointer events hide cursor feedback`
          : null,
        source.includes("cursor-default") ? `${rel}: actionable item uses cursor-default` : null,
      ].filter((violation): violation is string => violation !== null);
    });

    const tableSource = readFileSync(join(srcDir, "components/ui/table.tsx"), "utf8");
    if (!tableSource.includes('onClick && "cursor-pointer"')) {
      violations.push("components/ui/table.tsx: clickable rows must get cursor-pointer");
    }

    expect(violations).toEqual([]);
  });
});
