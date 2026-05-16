import { describe, expect, test } from "bun:test";
import { createProblemDetails, problemFromBridgeError } from "./problem";

describe("problem details", () => {
  test("maps bridge errors to RFC 9457 problem details with CloudGrid extensions", () => {
    const problem = problemFromBridgeError(
      {
        id: "ERR-014",
        code: "MESSAGE_BRIDGE_TIMEOUT",
        message: "nats provider leaked token=secret",
        retryable: true,
        details: { timeout_ms: 2000 },
      },
      "/graphql/request/req-1",
    );

    expect(problem).toEqual({
      type: "https://cloudgrid.dev/problems/message-bridge-timeout",
      title: "MESSAGE_BRIDGE_TIMEOUT",
      status: 504,
      detail: "Message bridge request timed out",
      instance: "/graphql/request/req-1",
      id: "ERR-014",
      code: "MESSAGE_BRIDGE_TIMEOUT",
      retryable: true,
      details: { timeout_ms: 2000 },
    });
  });

  test("creates sanitized fallback problems from taxonomy ids", () => {
    const problem = createProblemDetails({
      id: "ERR-006",
      detail: "Storage returned an empty response",
    });

    expect(problem.status).toBe(503);
    expect(problem.code).toBe("STORAGE_UNAVAILABLE");
    expect(problem.retryable).toBe(true);
    expect(problem.detail).toBe("Storage returned an empty response");
  });

  test("maps future security and live subscription taxonomy ids", () => {
    expect(createProblemDetails({ id: "ERR-015" })).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      detail: "Authentication is required",
      retryable: false,
    });
    expect(createProblemDetails({ id: "ERR-016" })).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      retryable: false,
    });
    expect(createProblemDetails({ id: "ERR-017" })).toMatchObject({
      status: 429,
      code: "SUBSCRIPTION_LIMIT_EXCEEDED",
      retryable: true,
    });
  });
});
