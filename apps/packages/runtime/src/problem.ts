export interface BridgeErrorLike {
  id: CloudGridErrorId;
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type CloudGridErrorId =
  | "ERR-001"
  | "ERR-002"
  | "ERR-003"
  | "ERR-004"
  | "ERR-005"
  | "ERR-006"
  | "ERR-007"
  | "ERR-008"
  | "ERR-009"
  | "ERR-010"
  | "ERR-011"
  | "ERR-012"
  | "ERR-013"
  | "ERR-014"
  | "ERR-015"
  | "ERR-016"
  | "ERR-017"
  | "ERR-018"
  | "ERR-019"
  | "ERR-020"
  | "ERR-021"
  | "ERR-022";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  id: CloudGridErrorId;
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

interface ErrorTaxonomyEntry {
  code: string;
  status: number;
  retryable: boolean;
  detail: string;
}

const errorTaxonomy: Record<CloudGridErrorId, ErrorTaxonomyEntry> = {
  "ERR-001": {
    code: "VALIDATION_FAILED",
    status: 400,
    retryable: false,
    detail: "Request validation failed",
  },
  "ERR-002": {
    code: "UNSUPPORTED_MEDIA_TYPE",
    status: 415,
    retryable: false,
    detail: "Unsupported media type",
  },
  "ERR-003": {
    code: "INVALID_CURSOR",
    status: 400,
    retryable: false,
    detail: "Invalid pagination cursor",
  },
  "ERR-004": {
    code: "TRACE_NOT_FOUND",
    status: 404,
    retryable: false,
    detail: "Trace was not found",
  },
  "ERR-005": {
    code: "METHOD_NOT_ALLOWED",
    status: 405,
    retryable: false,
    detail: "Method is not allowed",
  },
  "ERR-006": {
    code: "STORAGE_UNAVAILABLE",
    status: 503,
    retryable: true,
    detail: "Storage is unavailable",
  },
  "ERR-007": {
    code: "PARTIAL_WRITE",
    status: 503,
    retryable: true,
    detail: "Telemetry persistence partially failed",
  },
  "ERR-008": {
    code: "OTLP_DECODE_FAILED",
    status: 400,
    retryable: false,
    detail: "OTLP payload could not be decoded",
  },
  "ERR-009": {
    code: "CONFIG_INVALID",
    status: 500,
    retryable: false,
    detail: "Runtime configuration is invalid",
  },
  "ERR-010": {
    code: "RUNTIME_COMPOSITION_FAILED",
    status: 500,
    retryable: false,
    detail: "Runtime composition failed",
  },
  "ERR-011": {
    code: "STATIC_ASSET_NOT_FOUND",
    status: 404,
    retryable: false,
    detail: "Static asset was not found",
  },
  "ERR-012": {
    code: "REQUEST_TIMEOUT",
    status: 504,
    retryable: true,
    detail: "Request timed out",
  },
  "ERR-013": {
    code: "MESSAGE_BRIDGE_UNAVAILABLE",
    status: 503,
    retryable: true,
    detail: "Message bridge is unavailable",
  },
  "ERR-014": {
    code: "MESSAGE_BRIDGE_TIMEOUT",
    status: 504,
    retryable: true,
    detail: "Message bridge request timed out",
  },
  "ERR-015": {
    code: "UNAUTHENTICATED",
    status: 401,
    retryable: false,
    detail: "Authentication is required",
  },
  "ERR-016": {
    code: "FORBIDDEN",
    status: 403,
    retryable: false,
    detail: "The principal is not allowed to access this telemetry",
  },
  "ERR-017": {
    code: "SUBSCRIPTION_LIMIT_EXCEEDED",
    status: 429,
    retryable: true,
    detail: "Too many live telemetry subscriptions are open",
  },
  "ERR-018": {
    code: "ALERT_RULE_INVALID",
    status: 400,
    retryable: false,
    detail: "Alert rule configuration is invalid",
  },
  "ERR-019": {
    code: "ALERT_QUERY_UNSUPPORTED",
    status: 400,
    retryable: false,
    detail: "Alert query is unsupported",
  },
  "ERR-020": {
    code: "ALERT_NOTIFICATION_FAILED",
    status: 503,
    retryable: true,
    detail: "Alert notification delivery failed",
  },
  "ERR-021": {
    code: "ALERT_EVALUATOR_TIMEOUT",
    status: 504,
    retryable: true,
    detail: "Alert evaluator exceeded deadline",
  },
  "ERR-022": {
    code: "INVITATION_EMAIL_DELIVERY_FAILED",
    status: 503,
    retryable: true,
    detail: "Invitation email delivery failed",
  },
};

export function problemFromBridgeError(error: BridgeErrorLike, instance?: string): ProblemDetails {
  const input: {
    id: CloudGridErrorId;
    code: string;
    retryable: boolean;
    instance?: string;
    details?: Record<string, unknown>;
  } = {
    id: error.id,
    code: error.code,
    retryable: error.retryable,
  };
  if (instance) {
    input.instance = instance;
  }
  if (error.details) {
    input.details = error.details;
  }
  return createProblemDetails(input);
}

export function createProblemDetails(input: {
  id: CloudGridErrorId;
  code?: string;
  detail?: string;
  retryable?: boolean;
  instance?: string;
  details?: Record<string, unknown>;
}): ProblemDetails {
  const entry = errorTaxonomy[input.id];
  const code = input.code ?? entry.code;
  const problem: ProblemDetails = {
    type: `https://cloudgrid.dev/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title: code,
    status: entry.status,
    detail: input.detail ?? entry.detail,
    id: input.id,
    code,
    retryable: input.retryable ?? entry.retryable,
  };
  if (input.instance) {
    problem.instance = input.instance;
  }
  if (input.details) {
    problem.details = input.details;
  }
  return problem;
}
