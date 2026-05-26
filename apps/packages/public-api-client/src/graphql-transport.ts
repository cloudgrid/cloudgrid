import { z } from "zod";

export type LiveTraceConnectionState = "connecting" | "live" | "reconnecting" | "closed" | "error";

export interface LiveTraceSubscription {
  unsubscribe: () => void;
}

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const cloudGridProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string().optional(),
    id: z.string(),
    code: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), jsonValueSchema).optional(),
  })
  .passthrough();

const graphQLErrorSchema = z.object({
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  extensions: z
    .object({
      code: z.string().optional(),
      problem: cloudGridProblemSchema.optional(),
    })
    .passthrough()
    .optional(),
});

const graphQLResponseEnvelopeSchema = z
  .object({
    data: z.unknown().optional(),
    errors: z.array(graphQLErrorSchema).optional(),
  })
  .refine((response) => response.data !== undefined || response.errors !== undefined, {
    message: "GraphQL response must include data or errors",
  });

export type CloudGridProblemDetails = z.infer<typeof cloudGridProblemSchema>;
type GraphQLErrorEnvelope = z.infer<typeof graphQLErrorSchema>;

/**
 * Error thrown when CloudGrid returns GraphQL errors or an HTTP problem document.
 *
 * The `message` contains the best user-facing GraphQL or problem detail available.
 * When CloudGrid returned an RFC 7807-style problem payload, `problem` contains the
 * parsed error taxonomy fields so callers can inspect status, code, retryability,
 * and structured details.
 */
export class CloudGridGraphQLError extends Error {
  readonly problem: CloudGridProblemDetails | undefined;

  constructor(message: string, problem?: CloudGridProblemDetails) {
    super(message);
    this.name = "CloudGridGraphQLError";
    this.problem = problem;
  }
}

export async function requestGraphQL<Data>(
  endpoint: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Data> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ operationName, query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with HTTP ${response.status}`);
  }

  const parsedEnvelope = graphQLResponseEnvelopeSchema.safeParse(await response.json());
  if (!parsedEnvelope.success) {
    throw new Error("GraphQL response envelope was invalid");
  }

  const payload = parsedEnvelope.data;
  if (payload.errors?.length) {
    throw cloudGridGraphQLErrorFromEnvelope(payload.errors);
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error("GraphQL response did not include data");
  }
  return payload.data as Data;
}

export function graphqlWebSocketEndpoint(endpoint: string) {
  const base =
    typeof window === "undefined"
      ? "http://localhost"
      : `${window.location.protocol}//${window.location.host}`;
  const url = new URL(endpoint, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function subscribeGraphQL<Data>(
  endpoint: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  observer: {
    onStateChange?: (state: LiveTraceConnectionState) => void;
    onData: (data: Data) => void;
    onError?: (error: Error) => void;
  },
): LiveTraceSubscription {
  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    throw new Error("GraphQL subscriptions require WebSocket support");
  }

  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const operationId = `${operationName}:${crypto.randomUUID()}`;

  const closeSocket = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      return;
    }
    socket.close();
  };

  const connect = () => {
    observer.onStateChange?.(socket ? "reconnecting" : "connecting");
    socket = new WebSocketCtor(endpoint, "graphql-transport-ws");

    socket.addEventListener("open", () => {
      socket?.send(JSON.stringify({ type: "connection_init" }));
    });

    socket.addEventListener("message", (message) => {
      const payload = parseGraphQLSocketMessage(message.data);
      if (!payload) {
        return;
      }

      if (payload.type === "connection_ack") {
        observer.onStateChange?.("live");
        socket?.send(
          JSON.stringify({
            id: operationId,
            type: "subscribe",
            payload: { operationName, query, variables },
          }),
        );
        return;
      }

      if (payload.type === "next" && payload.id === operationId) {
        const parsedEnvelope = graphQLResponseEnvelopeSchema.safeParse(payload.payload);
        if (!parsedEnvelope.success) {
          observer.onError?.(new Error("GraphQL subscription envelope was invalid"));
          return;
        }
        if (parsedEnvelope.data.errors?.length) {
          observer.onError?.(cloudGridGraphQLErrorFromEnvelope(parsedEnvelope.data.errors));
          return;
        }
        if (parsedEnvelope.data.data !== undefined && parsedEnvelope.data.data !== null) {
          observer.onData(parsedEnvelope.data.data as Data);
        }
        return;
      }

      if (payload.type === "error" && payload.id === operationId) {
        observer.onError?.(cloudGridGraphQLErrorFromSubscriptionPayload(payload.payload));
      }
    });

    socket.addEventListener("error", () => {
      observer.onStateChange?.("error");
      observer.onError?.(new Error("GraphQL subscription socket failed"));
    });

    socket.addEventListener("close", () => {
      if (closedByClient) {
        observer.onStateChange?.("closed");
        return;
      }
      observer.onStateChange?.("reconnecting");
      reconnectTimer = setTimeout(connect, 1000);
    });
  };

  connect();

  return {
    unsubscribe() {
      closedByClient = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: operationId, type: "complete" }));
      }
      closeSocket();
    },
  };
}

function cloudGridGraphQLErrorFromEnvelope(errors: GraphQLErrorEnvelope[]) {
  const firstProblem = errors.find((error) => error.extensions?.problem)?.extensions?.problem;
  if (firstProblem) {
    return new CloudGridGraphQLError(
      firstProblem.detail || firstProblem.title || errors[0]?.message || firstProblem.code,
      firstProblem,
    );
  }

  return new CloudGridGraphQLError(errors.map((error) => error.message).join("; "));
}

function cloudGridGraphQLErrorFromSubscriptionPayload(payload: unknown) {
  const parsedEnvelope = graphQLResponseEnvelopeSchema.safeParse(payload);
  if (parsedEnvelope.success && parsedEnvelope.data.errors?.length) {
    return cloudGridGraphQLErrorFromEnvelope(parsedEnvelope.data.errors);
  }

  const parsedErrors = z.array(graphQLErrorSchema).safeParse(payload);
  if (parsedErrors.success && parsedErrors.data.length) {
    return cloudGridGraphQLErrorFromEnvelope(parsedErrors.data);
  }

  return new CloudGridGraphQLError("GraphQL subscription failed");
}

function parseGraphQLSocketMessage(data: unknown) {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }
    return parsed as {
      id?: string;
      type: string;
      payload?: unknown;
    };
  } catch {
    return null;
  }
}

export async function readCloudGridProblem(response: Response) {
  try {
    const parsed = cloudGridProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns `true` when an unknown error is a CloudGrid GraphQL error with a parsed
 * problem payload.
 *
 * Use this guard before reading `error.problem`; it narrows unknown values thrown
 * by client calls or AI chat streams to `CloudGridGraphQLError` instances that
 * include CloudGrid's structured problem metadata.
 */
export function isCloudGridProblemError(error: unknown): error is CloudGridGraphQLError {
  return error instanceof CloudGridGraphQLError && error.problem !== undefined;
}
