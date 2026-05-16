import { describe, expect, test } from "bun:test";
import { CloudGridGraphQLError, type CloudGridProblemDetails } from "../src/lib/graphql-client";
import { telemetryErrorViewModel } from "../src/lib/telemetry-error";

const storageProblem: CloudGridProblemDetails = {
  type: "https://cloudgrid.dev/problems/storage-unavailable",
  title: "Storage is unavailable",
  status: 503,
  detail: "Storage is unavailable",
  id: "ERR-006",
  code: "STORAGE_UNAVAILABLE",
  retryable: true,
};

describe("telemetry error view model", () => {
  test("exposes CloudGrid problem details from typed GraphQL errors", () => {
    expect(telemetryErrorViewModel(new CloudGridGraphQLError("fallback", storageProblem))).toEqual({
      title: "Storage is unavailable",
      description: "Storage is unavailable",
      code: "STORAGE_UNAVAILABLE",
      retryable: true,
      status: 503,
    });
  });

  test("accepts structurally equivalent CloudGrid problem errors", () => {
    expect(telemetryErrorViewModel({ problem: storageProblem })).toMatchObject({
      title: "Storage is unavailable",
      code: "STORAGE_UNAVAILABLE",
      status: 503,
    });
  });

  test("falls back to the generic error message without problem details", () => {
    expect(telemetryErrorViewModel(new Error("Network failed"))).toEqual({
      title: "Telemetry query failed",
      description: "Network failed",
      code: null,
      retryable: null,
      status: null,
    });
  });
});
