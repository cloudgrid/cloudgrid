import { describe, expect, test } from "bun:test";
import { parseBooleanFlag, parsePort } from "./validation";

describe("runtime validation", () => {
  test("parses strict ports", () => {
    expect(parsePort("3456", 3000)).toBe(3456);
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(() => parsePort("70000", 3000)).toThrow("ERR-009 CONFIG_INVALID");
  });

  test("parses explicit boolean flags", () => {
    expect(parseBooleanFlag("true", false)).toBe(true);
    expect(parseBooleanFlag("false", true)).toBe(false);
    expect(parseBooleanFlag(undefined, true)).toBe(true);
    expect(() => parseBooleanFlag("yes", false)).toThrow("ERR-009 CONFIG_INVALID");
  });
});
