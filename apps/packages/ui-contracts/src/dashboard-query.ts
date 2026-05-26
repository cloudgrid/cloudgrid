import type { DashboardListInput } from "./index";

export const DASHBOARD_LIST_DEFAULT_INCLUDE_BUILTINS = true;

export interface DashboardListDefaultsInput {
  includeBuiltins?: boolean | null;
  query?: string | null;
  tag?: string | null;
  visibility?: DashboardListInput["visibility"];
  pinnedOnly?: boolean | null;
}

export function buildDashboardListInput(
  input: DashboardListDefaultsInput = {},
): DashboardListInput {
  return {
    includeBuiltins: input.includeBuiltins ?? DASHBOARD_LIST_DEFAULT_INCLUDE_BUILTINS,
    query: nonEmptyString(input.query),
    tag: nonEmptyString(input.tag),
    visibility: input.visibility ?? null,
    pinnedOnly: input.pinnedOnly ?? null,
  };
}

function nonEmptyString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
