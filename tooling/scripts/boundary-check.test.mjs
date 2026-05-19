import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = join(import.meta.dir, "../..");

describe("CloudGrid private boundary checks", () => {
  test("public TypeScript surfaces and collector do not import SurrealDB or use SurrealDB credentials", () => {
    const checkedFiles = [
      ...sourceFiles("apps/backend", [".ts"]),
      ...sourceFiles("apps/frontend/src", [".ts", ".tsx"]),
      ...sourceFiles("core/otlp-collector", [".go"]),
    ];

    for (const file of checkedFiles) {
      const content = readFileSync(file, "utf8");
      expect(content, relative(root, file)).not.toMatch(
        /@surrealdb|surrealdb\.js|\/adapters\/surrealdb/,
      );
      expect(content, relative(root, file)).not.toMatch(
        /CLOUDGRID_SURREALDB_|SURREALDB_PASSWORD|SURREALDB_USERNAME/,
      );
    }
  });

  test("frontend source does not import private transport clients or private service contracts", () => {
    for (const file of sourceFiles("apps/frontend/src", [".ts", ".tsx"])) {
      const content = readFileSync(file, "utf8");
      expect(content, relative(root, file)).not.toMatch(/from ["']nats["']|from ["']@nats-io/);
      expect(content, relative(root, file)).not.toMatch(
        /core\/storage-|core\/otlp-collector|telemetry\.ingest\.|CLOUDGRID_NATS_URL|nats:\/\/|tls:\/\//,
      );
    }
  });

  test("BFF source does not subscribe to ingest or persisted telemetry streams", () => {
    for (const file of sourceFiles("apps/backend/src", [".ts"])) {
      const content = readFileSync(file, "utf8");
      expect(content, relative(root, file)).not.toMatch(
        /TELEMETRY_INGEST|telemetry\.ingest\.|telemetry\.persisted\.traces|JetStream|jetstream/,
      );
    }
  });

  test("production source does not export test doubles", () => {
    const checkedFiles = [
      ...sourceFiles("apps/backend/src", [".ts"]),
      ...sourceFiles("apps/frontend/src", [".ts", ".tsx"]),
      ...sourceFiles("apps/packages", [".ts", ".tsx"]),
      ...sourceFiles("core", [".go"]),
    ];

    for (const file of checkedFiles) {
      const relativePath = relative(root, file);
      if (
        relativePath.includes("/test-helpers.") ||
        relativePath.endsWith("_test.go") ||
        relativePath.includes("/fixtures/")
      ) {
        continue;
      }
      const content = readFileSync(file, "utf8");
      expect(content, relativePath).not.toMatch(
        /\bexport\s+(?:const|let|var|function|class)\s+(?:mock|fake|stub)[A-Z_]/,
      );
      expect(content, relativePath).not.toMatch(
        /\b(?:type|func|var|const)\s+(?:mock|fake|stub)[A-Z_]/,
      );
    }
  });

  test("SurrealDB Go SDK imports stay inside storage and control-plane adapters", () => {
    const allowed = new Set([
      "core/control-plane/go.mod",
      "core/control-plane/go.sum",
      "core/storage-read/go.mod",
      "core/storage-read/go.sum",
      "core/storage-write/go.mod",
      "core/storage-write/go.sum",
      "core/storage-maintenance/go.mod",
      "core/storage-maintenance/go.sum",
    ]);
    for (const file of sourceFiles(".", [".go", ".mod", ".sum"])) {
      const relativePath = relative(root, file);
      const content = readFileSync(file, "utf8");
      if (!content.includes("github.com/surrealdb/surrealdb.go")) {
        continue;
      }
      expect(
        allowed.has(relativePath) ||
          relativePath.startsWith("core/control-plane/internal/adapters/surrealdb/") ||
          relativePath.startsWith("core/storage-read/internal/adapters/surrealdb/") ||
          relativePath.startsWith("core/storage-write/internal/adapters/surrealdb/") ||
          relativePath.startsWith("core/storage-maintenance/internal/adapters/surrealdb/"),
        relativePath,
      ).toBe(true);
    }
  });
});

function sourceFiles(dir, extensions) {
  const absolute = join(root, dir);
  const files = [];
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === ".git" || entry === "node_modules" || entry === "dist" || entry === "public") {
        continue;
      }
      files.push(...sourceFiles(relative(root, path), extensions));
      continue;
    }
    if (
      extensions.includes(extname(path)) ||
      extensions.some((extension) => path.endsWith(extension))
    ) {
      files.push(path);
    }
  }
  return files;
}
