import { createLogger, type CloudGridLogger } from "@cloudgrid/runtime";
import { parse, subscribe, type ExecutionResult } from "graphql";
import type { AiEvalBridge, TelemetryQueryBridge } from "./bridge";
import { createCloudGridSchema, type CloudGridYogaContext } from "./graphql";
import { CloudGridAuthService, type AuthProviderFixture } from "./auth";
import type { AuthRuntimeConfig } from "@cloudgrid/runtime";

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

export function createGraphQLWebSocketHandler(
  bridge: TelemetryQueryBridge & Partial<AiEvalBridge>,
  logger: CloudGridLogger = createLogger("bff"),
  options: { auth?: AuthRuntimeConfig; authProvider?: AuthProviderFixture } = {},
) {
  const schema = createCloudGridSchema();
  const auth = new CloudGridAuthService(
    options.auth,
    options.authProvider ? { provider: options.authProvider } : {},
  );
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
      void handleMessage(socket, raw.toString(), bridge, logger, schema, auth);
    },
    close(socket: GraphQLWebSocketLike) {
      for (const iterator of socket.data.operations.values()) {
        void iterator.return?.();
      }
      socket.data.operations.clear();
    },
  };
}

async function handleMessage(
  socket: GraphQLWebSocketLike,
  raw: string,
  bridge: TelemetryQueryBridge,
  logger: CloudGridLogger,
  schema: ReturnType<typeof createCloudGridSchema>,
  auth: CloudGridAuthService,
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
    await iterator?.return?.();
    return;
  }

  if (message.type !== "subscribe" || !message.id || !message.payload?.query) {
    socket.close(4400, "Unsupported GraphQL WebSocket message");
    return;
  }

  const contextValue: CloudGridYogaContext = {
    hono: { get: () => bridge },
    requestId: crypto.randomUUID(),
    logger,
    authContext: auth.authenticateWebSocket(socket.data.request, socket.data.authorization),
  };
  const result = await subscribe({
    schema,
    document: parse(message.payload.query),
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
    socket.send(
      JSON.stringify({
        id: message.id,
        type: "error",
        payload: [
          {
            message: error instanceof Error ? error.message : "GraphQL subscription failed",
          },
        ],
      }),
    );
  } finally {
    socket.data.operations.delete(message.id);
  }
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
