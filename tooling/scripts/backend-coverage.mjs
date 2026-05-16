#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const minCoverage = 80;

const bff = run("bun", ["test", "--coverage", "apps/backend/src"]);
const bffMatch = bff.output.match(/All files\s+\|\s+[\d.]+\s+\|\s+([\d.]+)/);
if (!bffMatch) {
  fail("Could not parse BFF coverage from bun test output");
}
const bffLines = Number(bffMatch[1]);
if (bffLines <= minCoverage) {
  fail(`BFF line coverage ${bffLines}% is not above ${minCoverage}%`);
}

run("go", [
  "test",
  "-tags",
  "surrealdb",
  "-coverprofile=/tmp/cloudgrid-go-backend.out",
  "./core/otlp-collector/...",
  "./core/storage-read/...",
  "./core/storage-write/...",
]);
const goCover = run("go", ["tool", "cover", "-func=/tmp/cloudgrid-go-backend.out"]);
const goMatch = goCover.output.match(/total:\s+\(statements\)\s+([\d.]+)%/);
if (!goMatch) {
  fail("Could not parse Go aggregate coverage from go tool cover output");
}
const goStatements = Number(goMatch[1]);
if (goStatements <= minCoverage) {
  fail(`Go backend statement coverage ${goStatements}% is not above ${minCoverage}%`);
}

console.log(`backend coverage ok: BFF lines ${bffLines}%, Go statements ${goStatements}%`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout}${result.stderr}`;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return { output };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
