import { CloudGridGraphQLError, type CloudGridProblemDetails } from "./graphql-client";
import { t } from "./i18n";

export interface TelemetryErrorViewModel {
  title: string;
  description: string;
  code: string | null;
  retryable: boolean | null;
  status: number | null;
}

export function telemetryErrorViewModel(error: unknown): TelemetryErrorViewModel {
  const problem = cloudGridProblemFromError(error);
  if (problem) {
    return {
      title: problem.title || t("state.error.title"),
      description: problem.detail || messageFromError(error),
      code: problem.code || problem.id,
      retryable: problem.retryable,
      status: problem.status,
    };
  }

  return {
    title: t("state.error.title"),
    description: messageFromError(error),
    code: null,
    retryable: null,
    status: null,
  };
}

export function cloudGridProblemFromError(error: unknown): CloudGridProblemDetails | null {
  if (error instanceof CloudGridGraphQLError && error.problem) {
    return error.problem;
  }

  if (!error || typeof error !== "object" || !("problem" in error)) {
    return null;
  }

  const problem = error.problem;
  if (!problem || typeof problem !== "object") {
    return null;
  }

  const candidate = problem as Partial<CloudGridProblemDetails>;
  if (
    typeof candidate.title === "string" &&
    typeof candidate.detail === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.retryable === "boolean" &&
    typeof candidate.status === "number"
  ) {
    return candidate as CloudGridProblemDetails;
  }

  return null;
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }
  return t("state.error.description");
}
