#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const minCoverage = 80;
const goCoverageProfile = "/tmp/cloudgrid-go-backend.out";
const goCoverageScopedProfile = "/tmp/cloudgrid-go-backend.scoped.out";
const goCoverageExcludedPaths = ["/cmd/", "/nats_adapter.go", "/client.go"];

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
  `-coverprofile=${goCoverageProfile}`,
  "./core/otlp-collector/...",
  "./core/storage-read/...",
  "./core/storage-write/...",
]);
writeFileSync(
  goCoverageScopedProfile,
  scopedGoCoverageProfile(readFileSync(goCoverageProfile, "utf8")),
);
const goCover = run("go", ["tool", "cover", `-func=${goCoverageScopedProfile}`]);
const goMatch = goCover.output.match(/total:\s+\(statements\)\s+([\d.]+)%/);
if (!goMatch) {
  fail("Could not parse Go aggregate coverage from go tool cover output");
}
const goStatements = Number(goMatch[1]);
if (goStatements <= minCoverage) {
  fail(`Go backend statement coverage ${goStatements}% is not above ${minCoverage}%`);
}

console.log(`backend coverage ok: BFF lines ${bffLines}%, Go scoped statements ${goStatements}%`);

function scopedGoCoverageProfile(profile) {
  const lines = profile.trimEnd().split("\n");
  const header = lines[0];
  const records = lines
    .slice(1)
    .filter((line) => !goCoverageExcludedPaths.some((path) => line.includes(path)));
  return `${header}\n${records.join("\n")}\n`;
}

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
