import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSetupLocal } from "./setup-local.mjs";

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cloudgrid-setup-local-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("setup local script", () => {
  test("creates local token routing env without printing token values", async () => {
    const defaultToken = "default-token-abcdefghijklmnopqrstuvwxyz123456";
    const systemToken = "system-token-abcdefghijklmnopqrstuvwxyz1234567";
    const logs = [];

    await runSetupLocal({
      cwd: tempDir,
      log: (message) => logs.push(message),
      nextToken: (() => {
        const tokens = [defaultToken, systemToken];
        return () => tokens.shift();
      })(),
      isPortAvailable: async () => true,
    });

    const env = await readFile(join(tempDir, ".env"), "utf8");
    const tokenMap = JSON.parse(
      env.match(/^CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS=(.+)$/m)?.[1] ?? "{}",
    );

    expect(tokenMap[defaultToken]).toBe("default");
    expect(tokenMap[systemToken]).toBe("cloudgrid-system");
    expect(env).toContain("CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default");
    expect(env).toContain(`CLOUDGRID_PROJECT_API_KEY=${defaultToken}`);
    expect(env).toContain("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID=cloudgrid-system");
    expect(env).toContain("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID=local");
    expect(env).toContain(`CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN=${systemToken}`);
    expect(env).toContain("CLOUDGRID_NATS_PORT=4222");
    expect(env).toContain("CLOUDGRID_NATS_MONITOR_PORT=8222");
    expect(env).toContain("CLOUDGRID_NATS_URL=nats://localhost:4222");
    expect(env).toContain("CLOUDGRID_SURREALDB_PORT=8000");
    expect(env).toContain("CLOUDGRID_SURREALDB_URL=http://localhost:8000/rpc");
    expect(logs.join("\n")).not.toContain(defaultToken);
    expect(logs.join("\n")).not.toContain(systemToken);
  });

  test("preserves existing valid default and self-observability tokens idempotently", async () => {
    const defaultToken = "existing-default-token-abcdefghijklmnopqrstuvwxyz";
    const systemToken = "existing-system-token-abcdefghijklmnopqrstuvwxyz1";
    await writeFile(
      join(tempDir, ".env"),
      [
        "# keep this comment",
        "UNRELATED_SECRET=do-not-touch",
        `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS={"${defaultToken}":"default","${systemToken}":"cloudgrid-system"}`,
        "CLOUDGRID_PROJECT_API_KEY=stale-default",
        "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN=stale-system",
        "",
      ].join("\n"),
    );
    const logs = [];

    await runSetupLocal({
      cwd: tempDir,
      log: (message) => logs.push(message),
      nextToken: () => {
        throw new Error("should not rotate existing valid tokens");
      },
      isPortAvailable: async () => true,
    });

    const env = await readFile(join(tempDir, ".env"), "utf8");

    expect(env).toContain("# keep this comment");
    expect(env).toContain("UNRELATED_SECRET=do-not-touch");
    expect(env).toContain(`"${defaultToken}":"default"`);
    expect(env).toContain(`"${systemToken}":"cloudgrid-system"`);
    expect(env).toContain(`CLOUDGRID_PROJECT_API_KEY=${defaultToken}`);
    expect(env).toContain(`CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN=${systemToken}`);
    expect(logs.join("\n")).not.toContain(defaultToken);
    expect(logs.join("\n")).not.toContain(systemToken);
  });

  test("moves local SurrealDB compose port when the default port is occupied", async () => {
    const defaultToken = "default-token-abcdefghijklmnopqrstuvwxyz123456";
    const systemToken = "system-token-abcdefghijklmnopqrstuvwxyz1234567";
    const logs = [];
    const unavailablePorts = new Set([8000]);

    await runSetupLocal({
      cwd: tempDir,
      log: (message) => logs.push(message),
      nextToken: (() => {
        const tokens = [defaultToken, systemToken];
        return () => tokens.shift();
      })(),
      nextPort: (() => {
        const ports = [18000];
        return async () => ports.shift();
      })(),
      isPortAvailable: async (port) => !unavailablePorts.has(port),
    });

    const env = await readFile(join(tempDir, ".env"), "utf8");

    expect(env).toContain("CLOUDGRID_SURREALDB_PORT=18000");
    expect(env).toContain("CLOUDGRID_SURREALDB_URL=http://localhost:18000/rpc");
    expect(logs.join("\n")).toContain("SurrealDB CLOUDGRID_SURREALDB_PORT port 8000 was unavailable; selected 18000.");
  });
});
