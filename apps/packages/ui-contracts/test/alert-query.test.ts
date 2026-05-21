import { describe, expect, test } from "bun:test";
import {
  ALERT_HISTORY_DEFAULT_FIRST,
  ALERT_HISTORY_HARD_FIRST,
  ALERT_RULE_SORTS,
  buildAlertHistoryInput,
  buildAlertRuleSearchInput,
  defaultAlertRuleSort,
} from "../src/alert-query";

describe("shared alert query contracts", () => {
  test("builds alert rule search input for UI routes and AI tool calls", () => {
    expect(defaultAlertRuleSort()).toBe("updatedAt_desc");
    expect(ALERT_RULE_SORTS).toContain("severity_desc");
    expect(
      buildAlertRuleSearchInput({
        search: "checkout",
        severity: "ERROR",
        signal: "TRACE",
        enabled: true,
        sort: "severity_desc",
      }),
    ).toEqual({
      search: "checkout",
      status: null,
      severity: "ERROR",
      signal: "TRACE",
      enabled: true,
      sort: "severity_desc",
    });
    expect(buildAlertRuleSearchInput({ search: " ", sort: "unknown" })).toEqual({
      search: null,
      status: null,
      severity: null,
      signal: null,
      enabled: null,
      sort: "updatedAt_desc",
    });
  });

  test("builds bounded alert history input defaults", () => {
    expect(ALERT_HISTORY_DEFAULT_FIRST).toBe(50);
    expect(ALERT_HISTORY_HARD_FIRST).toBe(200);
    expect(buildAlertHistoryInput({ ruleId: "rule-1", first: 500 })).toEqual({
      ruleId: "rule-1",
      first: ALERT_HISTORY_HARD_FIRST,
      after: null,
    });
    expect(buildAlertHistoryInput({ first: null, after: "cursor-1" })).toEqual({
      ruleId: null,
      first: ALERT_HISTORY_DEFAULT_FIRST,
      after: "cursor-1",
    });
  });
});
