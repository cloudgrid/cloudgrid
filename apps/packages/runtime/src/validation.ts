import { z } from "zod";

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = z.coerce.number().int().min(1).max(65535).safeParse(value);
  if (!parsed.success) {
    throw new Error(`ERR-009 CONFIG_INVALID: invalid port ${value}`);
  }
  return parsed.data;
}

export function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`ERR-009 CONFIG_INVALID: invalid boolean flag ${value}`);
}

export function parseWithZod<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`ERR-001 VALIDATION_FAILED: ${label}`);
  }
  return parsed.data;
}

export { z };
