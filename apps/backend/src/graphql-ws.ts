import type { AuthRuntimeConfig } from "@cloudgrid/runtime";
import { type CloudGridLogger, createLogger, createProblemDetails } from "@cloudgrid/runtime";
import { type ExecutionResult, GraphQLError, parse, subscribe } from "graphql";
import { type AuthProviderFixture, CloudGridAuthService } from "./auth";
import type { AiEvalBridge, TelemetryQueryBridge } from "./bridge";
import { type CloudGridYogaContext, createCloudGridSchema } from "./graphql";

const GRAPHQL_TRANSPORT_WS_PROTOCOL = "graphql-transport-ws";

interface GraphQLWebSocketMessage {
  id?: string;
  type: string;
  payload?: {
    authorization?: string;
    query?: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  };
}

export interface GraphQLWebSocketState {
  operations: Map<string, AsyncIterator<ExecutionResult>>;
  request?: Request | undefined;
  authorization?: string | undefined;
}

export interface GraphQLWebSocketLike {
  data: GraphQLWebSocketState;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
}

interface GraphQLWebSocketOptions {
  auth?: AuthRuntimeConfig;
  authProvider?: AuthProviderFixture;
  maxMessageBytes?: number;
  maxOperations?: number;
  cleanupTimeoutMs?: number;
}

const defaultMaxMessageBytes = 1_048_576;
const defaultMaxOperations = 32;
const defaultCleanupTimeoutMs = 1000;

export function createGraphQLWebSocketHandler(
  bridge: TelemetryQueryBridge & Partial<AiEvalBridge>,
  logger: CloudGridLogger = createLogger("bff"),
  options: GraphQLWebSocketOptions = {},
) {
  const schema = createCloudGridSchema();
  const auth = new CloudGridAuthService(
    options.auth,
    options.authProvider ? { provider: options.authProvider } : {},
  );
  const maxMessageBytes = options.maxMessageBytes ?? defaultMaxMessageBytes;
  const maxOperations = options.maxOperations ?? defaultMaxOperations;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? defaultCleanupTimeoutMs;
  const sockets = new Set<GraphQLWebSocketLike>();
  let shuttingDown = false;
  return {
    auth,
    protocol: GRAPHQL_TRANSPORT_WS_PROTOCOL,
    open(request?: Request): GraphQLWebSocketState {
      const state: GraphQLWebSocketState = { operations: new Map() };
      if (request) {
        state.request = request;
      }
      return state;
    },
    message(socket: GraphQLWebSocketLike, raw: string | Buffer) {
      if (shuttingDown) {
        socket.close(1012, "GraphQL WebSocket server is shutting down");
        return;
      }
      sockets.add(socket);
      if (rawMessageBytes(raw) > maxMessageBytes) {
        socket.close(4409, "GraphQL WebSocket message is too large");
        return;
      }
      void handleMessage(socket, raw.toString(), bridge, logger, schema, auth, {
        maxOperations,
        cleanupTimeoutMs,
      }).catch((error) => {
        if (isClientDisconnectError(error)) {
          return;
        }
        logger.error("graphql_websocket_message_failed", {
          error_id: "ERR-014",
          error_code: "MESSAGE_BRIDGE_TIMEOUT",
          error_message: "GraphQL WebSocket message handling failed",
        });
      });
    },
    async close(socket: GraphQLWebSocketLike) {
      sockets.delete(socket);
      await cleanupSocketOperations(socket, logger, cleanupTimeoutMs);
    },
    async shutdown() {
      shuttingDown = true;
      const activeSockets = [...sockets];
      sockets.clear();
      await Promise.all(
        activeSockets.map((socket) => cleanupSocketOperations(socket, logger, cleanupTimeoutMs)),
      );
    },
  };
}

function isClientDisconnectError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message === "The connection was closed.")
  );
}

async function handleMessage(
  socket: GraphQLWebSocketLike,
  raw: string,
  bridge: TelemetryQueryBridge,
  logger: CloudGridLogger,
  schema: ReturnType<typeof createCloudGridSchema>,
  auth: CloudGridAuthService,
  limits: { maxOperations: number; cleanupTimeoutMs: number },
) {
  const message = parseMessage(raw);
  if (!message) {
    socket.close(4400, "Invalid GraphQL WebSocket message");
    return;
  }

  if (message.type === "connection_init") {
    socket.data.authorization = message.payload?.authorization;
    socket.send(JSON.stringify({ type: "connection_ack" }));
    return;
  }

  if (message.type === "complete" && message.id) {
    const iterator = socket.data.operations.get(message.id);
    socket.data.operations.delete(message.id);
    if (iterator) {
      await cleanupOperation(message.id, iterator, logger, limits.cleanupTimeoutMs);
    }
    return;
  }

  if (message.type !== "subscribe" || !message.id || !message.payload?.query) {
    socket.close(4400, "Unsupported GraphQL WebSocket message");
    return;
  }
  if (
    !socket.data.operations.has(message.id) &&
    socket.data.operations.size >= limits.maxOperations
  ) {
    socket.close(4409, "Too many active GraphQL operations");
    return;
  }

  function getHonoValue(key: "auth"): typeof auth;
  function getHonoValue(key: "bridge"): typeof bridge;
  function getHonoValue(key: "auth" | "bridge") {
    return key === "auth" ? auth : bridge;
  }

  const contextValue: CloudGridYogaContext = {
    hono: { get: getHonoValue },
    requestId: crypto.randomUUID(),
    logger,
    authContext: auth.authenticateWebSocket(socket.data.request, socket.data.authorization),
  };
  let document: ReturnType<typeof parse>;
  try {
    document = parse(message.payload.query);
  } catch {
    socket.send(
      JSON.stringify({
        id: message.id,
        type: "error",
        payload: [
          {
            message: "Request validation failed",
            extensions: {
              code: "VALIDATION_FAILED",
              problem: createProblemDetails({
                id: "ERR-001",
                instance: `/graphql/subscription/${contextValue.requestId}`,
              }),
            },
          },
        ],
      }),
    );
    socket.send(JSON.stringify({ id: message.id, type: "complete" }));
    return;
  }

  const result = await subscribe({
    schema,
    document,
    variableValues: message.payload.variables,
    operationName: message.payload.operationName,
    contextValue,
  });

  if (!isAsyncIterable(result)) {
    socket.send(JSON.stringify({ id: message.id, type: "next", payload: result }));
    socket.send(JSON.stringify({ id: message.id, type: "complete" }));
    return;
  }

  const iterator = result[Symbol.asyncIterator]();
  socket.data.operations.set(message.id, iterator);
  try {
    for await (const payload of result) {
      if (!socket.data.operations.has(message.id)) {
        return;
      }
      socket.send(JSON.stringify({ id: message.id, type: "next", payload }));
    }
    socket.send(JSON.stringify({ id: message.id, type: "complete" }));
  } catch (error) {
    logger.error("graphql_subscription_stream_failed", {
      request_id: contextValue.requestId,
      error_id: "ERR-014",
      error_code: "MESSAGE_BRIDGE_TIMEOUT",
      error_message: "GraphQL subscription stream failed",
    });
    const formattedError = graphQLSubscriptionStreamError(contextValue.requestId, error);
    socket.send(
      JSON.stringify({
        id: message.id,
        type: "error",
        payload: [formattedError],
      }),
    );
  } finally {
    socket.data.operations.delete(message.id);
  }
}

function rawMessageBytes(raw: string | Buffer): number {
  return typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
}

async function cleanupSocketOperations(
  socket: GraphQLWebSocketLike,
  logger: CloudGridLogger,
  timeoutMs: number,
) {
  const operations = [...socket.data.operations.entries()];
  socket.data.operations.clear();
  await Promise.all(
    operations.map(([operationId, iterator]) =>
      cleanupOperation(operationId, iterator, logger, timeoutMs),
    ),
  );
}

async function cleanupOperation(
  operationId: string,
  iterator: AsyncIterator<ExecutionResult>,
  logger: CloudGridLogger,
  timeoutMs: number,
) {
  try {
    const returned =
      iterator.return?.() ??
      Promise.resolve({
        done: true,
        value: undefined,
      } as unknown as IteratorResult<ExecutionResult>);
    await withCleanupTimeout(returned, timeoutMs);
  } catch {
    logger.error("graphql_websocket_operation_cleanup_failed", {
      request_id: "",
      operation_id: operationId,
      error_id: "ERR-014",
      error_code: "MESSAGE_BRIDGE_TIMEOUT",
      message: "GraphQL WebSocket operation cleanup failed",
    });
  }
}

function withCleanupTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("GraphQL WebSocket cleanup timed out")), timeoutMs);
  });
  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function parseMessage(raw: string): GraphQLWebSocketMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof parsed.type === "string"
    ) {
      return parsed as GraphQLWebSocketMessage;
    }
    return null;
  } catch {
    return null;
  }
}

function isAsyncIterable(
  value: AsyncIterable<ExecutionResult> | ExecutionResult,
): value is AsyncIterable<ExecutionResult> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function graphQLSubscriptionStreamError(requestId: string, error: unknown) {
  if (error instanceof GraphQLError) {
    return error.toJSON();
  }

  const problem = createProblemDetails({
    id: "ERR-014",
    instance: `/graphql/subscription/${requestId}`,
  });

  return {
    message: problem.detail,
    extensions: {
      code: problem.code,
      problem,
    },
  };
}
