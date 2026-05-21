import { describe, expect, test } from "bun:test";
import configFactory from "../vite.config";

describe("frontend Vite config", () => {
  test("proxies BFF-owned routes in development", () => {
    const config =
      typeof configFactory === "function"
        ? configFactory({
            command: "serve",
            mode: "development",
            isPreview: false,
            isSsrBuild: false,
          })
        : configFactory;

    expect(config.server?.proxy).toMatchObject({
      "/auth": {
        changeOrigin: true,
        target: "http://localhost:3000",
      },
      "/api": {
        changeOrigin: true,
        target: "http://localhost:3000",
      },
      "/graphql": {
        changeOrigin: true,
        target: "http://localhost:3000",
      },
    });
  });
});
