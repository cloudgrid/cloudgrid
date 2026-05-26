import { describe, expect, test } from "bun:test";
import {
  buildDashboardListInput,
  DASHBOARD_LIST_DEFAULT_INCLUDE_BUILTINS,
} from "../src/dashboard-query";

describe("shared dashboard query contracts", () => {
  test("builds dashboard list input for UI routes and AI tool calls", () => {
    expect(buildDashboardListInput({ query: "tokens" })).toEqual({
      includeBuiltins: DASHBOARD_LIST_DEFAULT_INCLUDE_BUILTINS,
      query: "tokens",
      tag: null,
      visibility: null,
      pinnedOnly: null,
    });
    expect(
      buildDashboardListInput({
        includeBuiltins: false,
        query: " ",
        tag: "genai",
        visibility: "personal",
        pinnedOnly: true,
      }),
    ).toEqual({
      includeBuiltins: false,
      query: null,
      tag: "genai",
      visibility: "personal",
      pinnedOnly: true,
    });
  });
});
