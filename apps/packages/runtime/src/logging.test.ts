import { describe, expect, test } from "bun:test";
import { createLogger } from "./logging";

describe("runtime structured logger", () => {
  test("writes Kubernetes-friendly JSON completion logs", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const logger = createLogger("bff", {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    logger.info("graphql_operation_completed", {
      request_id: "req-1",
      operation_or_subject: "traces",
      status: "ok",
      duration_ms: 12,
    });

    expect(stderr).toHaveLength(0);
    expect(stdout).toHaveLength(1);
    const line = stdout[0] ?? "";
    const entry = JSON.parse(line);
    for (const key of [
      "timestamp",
      "level",
      "service",
      "event",
      "request_id",
      "message",
      "operation_or_subject",
      "status",
      "duration_ms",
    ]) {
      expect(entry).toHaveProperty(key);
    }
    expect(entry).toMatchObject({
      level: "info",
      service: "bff",
      event: "graphql_operation_completed",
      request_id: "req-1",
      operation_or_subject: "traces",
      status: "ok",
      duration_ms: 12,
    });
    expect(line).not.toContain("password");
    expect(line).not.toContain("query {");
  });
});
