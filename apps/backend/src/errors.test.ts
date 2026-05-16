import { describe, expect, test } from "bun:test";
import { graphQLErrorFromBridge } from "./index";

describe("BFF GraphQL errors", () => {
  test("exposes CloudGrid problem details in GraphQL extensions", () => {
    const error = graphQLErrorFromBridge(
      {
        id: "ERR-013",
        code: "MESSAGE_BRIDGE_UNAVAILABLE",
        message: "Message bridge is unavailable",
        retryable: true,
      },
      "request-1",
    );

    expect(error.extensions.code).toBe("MESSAGE_BRIDGE_UNAVAILABLE");
    expect(error.extensions.problem).toEqual({
      type: "https://cloudgrid.dev/problems/message-bridge-unavailable",
      title: "MESSAGE_BRIDGE_UNAVAILABLE",
      status: 503,
      detail: "Message bridge is unavailable",
      instance: "/graphql/request/request-1",
      id: "ERR-013",
      code: "MESSAGE_BRIDGE_UNAVAILABLE",
      retryable: true,
    });
  });

  test("uses sanitized taxonomy details instead of raw bridge provider messages", () => {
    const error = graphQLErrorFromBridge(
      {
        id: "ERR-006",
        code: "STORAGE_UNAVAILABLE",
        message: "SurrealDB rejected password=secret",
        retryable: true,
      },
      "request-1",
    );

    expect(error.message).toBe("Storage is unavailable");
    expect(error.extensions.problem).toMatchObject({
      detail: "Storage is unavailable",
      id: "ERR-006",
      code: "STORAGE_UNAVAILABLE",
    });
    expect(JSON.stringify(error)).not.toContain("password=secret");
    expect(JSON.stringify(error.extensions.problem)).not.toContain("SurrealDB rejected");
  });
});
