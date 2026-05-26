import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TelemetryQueryBridge } from "./bridge";
import { createAppWithBridge } from "./graphql";
import { ssoAuthConfig } from "./test-helpers";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("BFF static frontend serving", () => {
  test("serves built assets and falls back to the SPA index", async () => {
    const staticDir = mkdtempSync(join(tmpdir(), "cloudgrid-static-"));
    tempDirs.push(staticDir);
    writeFileSync(join(staticDir, "index.html"), "<main>CloudGrid</main>");

    const { app } = createAppWithBridge(bridge(), {
      frontendServeStatic: true,
      frontendStaticDir: staticDir,
    });

    const root = await app.request("/");
    const route = await app.request("/traces/trace-1");
    const reserved = await app.request("/api/not-found");

    expect(root.status).toBe(200);
    expect(await root.text()).toContain("CloudGrid");
    expect(route.status).toBe(200);
    expect(await route.text()).toContain("CloudGrid");
    expect(reserved.status).toBe(404);
  });

  test("deployed app shell redirects unauthenticated users to SSO login", async () => {
    const staticDir = mkdtempSync(join(tmpdir(), "cloudgrid-static-"));
    tempDirs.push(staticDir);
    writeFileSync(join(staticDir, "index.html"), "<main>CloudGrid</main>");
    writeFileSync(join(staticDir, "app.js"), "console.log('asset');");

    const { app } = createAppWithBridge(bridge(), {
      frontendServeStatic: true,
      frontendStaticDir: staticDir,
      auth: ssoAuthConfig(),
    });

    const shell = await app.request("/traces?project=project-1");
    const asset = await app.request("/assets/app.js");

    expect(shell.status).toBe(302);
    expect(shell.headers.get("location")).toBe(
      "http://localhost/auth/login?returnTo=%2Ftraces%3Fproject%3Dproject-1",
    );
    expect(asset.status).toBe(404);
  });

  test("deployed app shell serves for authenticated bearer callers", async () => {
    const staticDir = mkdtempSync(join(tmpdir(), "cloudgrid-static-"));
    tempDirs.push(staticDir);
    writeFileSync(join(staticDir, "index.html"), "<main>CloudGrid</main>");

    const { app, auth } = createAppWithBridge(bridge(), {
      frontendServeStatic: true,
      frontendStaticDir: staticDir,
      auth: ssoAuthConfig(),
    });
    const token = await auth.issueTestBearerToken({
      sub: "machine-shell",
      scopes: ["telemetry:read"],
    });

    const response = await app.request("/dashboards", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("CloudGrid");
  });
});

function bridge(): TelemetryQueryBridge {
  return {
    async searchTraces() {
      return { items: [], nextCursor: null };
    },
    async getTraceDetail() {
      return null;
    },
    async searchLogs() {
      return { items: [], nextCursor: null };
    },
    async telemetryFacets() {
      return {
        services: [],
        operations: [],
        spanNames: [],
        severities: [],
        attributeKeys: [],
      };
    },
    subscribeLiveTraces() {
      return liveEvents([]);
    },
    async health() {
      return "ok";
    },
    async close() {},
  };
}

async function* liveEvents<T>(events: T[]): AsyncIterableIterator<T> {
  for (const event of events) {
    yield event;
  }
}
