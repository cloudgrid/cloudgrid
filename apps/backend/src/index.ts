import { createLogger, createProblemDetails } from "@cloudgrid/runtime";
import type { RuntimeConfig } from "./config";
import { loadConfig, startupProblem } from "./config";
import { createApp } from "./graphql";
import type { GraphQLWebSocketState } from "./graphql-ws";
import { createGraphQLWebSocketHandler } from "./graphql-ws";

export type { AuthenticatedPrincipal, AuthProviderFixture, NormalizedAuthContext } from "./auth";
export { CloudGridAuthService } from "./auth";
export type {
  AiEvalBridge,
  CloudGridBridge,
  ControlPlaneBridge,
  MetricQueryBridge,
  TelemetryQueryBridge,
} from "./bridge";
export { graphQLErrorFromBridge, NATSTelemetryQueryBridge } from "./bridge";
export type { RuntimeConfig } from "./config";
export { loadConfig, startupProblem } from "./config";
export { createApp, createAppWithBridge, createCloudGridSchema } from "./graphql";
export type { GraphQLMetricRecord, GraphQLMetricsRecorder } from "./graphql-metrics";
export { createGraphQLWebSocketHandler } from "./graphql-ws";

let clientDisconnectHandlersInstalled = false;

if (import.meta.main) {
  await startServer();
}

export async function startServer() {
  const logger = createLogger("bff");
  try {
    const config = loadConfig();
    const { app, bridge, selfObservability } = await createApp(config, logger);
    const graphQLWebSocket = createGraphQLWebSocketHandler(bridge, logger, { auth: config.auth });
    installClientDisconnectHandlers(logger);
    const server = Bun.serve(createServeOptions(config, app, graphQLWebSocket, logger));

    let shutdownStarted = false;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shutdownStarted) {
        return;
      }
      shutdownStarted = true;
      logger.info("shutdown_started", { signal });
      const timeout = setTimeout(() => {
        logger.error("shutdown_forced", { signal, duration_ms: 10_000 });
        process.exit(1);
      }, 10_000);
      timeout.unref();

      try {
        server.stop(false);
        await graphQLWebSocket.shutdown();
        await bridge.close();
        await selfObservability?.shutdown();
        clearTimeout(timeout);
        logger.info("shutdown_completed", { signal });
        process.exit(0);
      } catch (error) {
        clearTimeout(timeout);
        logger.error("shutdown_failed", {
          signal,
          error_code: "SHUTDOWN_FAILED",
          message: error instanceof Error ? error.message : "Shutdown failed",
        });
        process.exit(1);
      }
    };

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);

    logger.info("startup_ready", {
      message: `CloudGrid BFF listening on http://${config.host}:${config.port}`,
    });
  } catch (error) {
    const problem = startupProblem(error);
    logger.error("startup_failed", {
      error_id: problem.errorId,
      error_code: problem.errorCode,
      message: problem.message,
      detail: error instanceof Error ? error.message : undefined,
    });
    process.exit(1);
  }
}

export function createServeOptions(
  config: Pick<RuntimeConfig, "host" | "port">,
  app: { fetch: (request: Request) => Response | Promise<Response> },
  graphQLWebSocket: Pick<
    ReturnType<typeof createGraphQLWebSocketHandler>,
    "protocol" | "open" | "message" | "close"
  >,
  logger: Pick<ReturnType<typeof createLogger>, "debug" | "error"> = createLogger("bff"),
) {
  return {
    hostname: config.host,
    idleTimeout: 255,
    port: config.port,
    fetch: async (
      request: Request,
      server: {
        upgrade: (
          request: Request,
          options: { headers?: HeadersInit; data: GraphQLWebSocketState },
        ) => boolean;
      },
    ) => {
      if (isGraphQLWebSocketRequest(request)) {
        const upgraded = server.upgrade(request, {
          data: graphQLWebSocket.open(request),
          headers: { "Sec-WebSocket-Protocol": graphQLWebSocket.protocol },
        });
        if (upgraded) {
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      try {
        return await app.fetch(request);
      } catch (error) {
        if (isClientDisconnectError(error)) {
          logger.debug("client_disconnected", {
            method: request.method,
            path: new URL(request.url).pathname,
            message: "client_disconnected",
          });
          return new Response(null, { status: 499 });
        }
        const problem = createProblemDetails({
          id: "ERR-010",
          detail: "Request handling failed",
        });
        logger.error("request_failed", {
          ...logErrorFields(error),
          error_id: problem.id,
          error_code: problem.code,
          method: request.method,
          path: new URL(request.url).pathname,
          status: problem.status,
          message: problem.detail,
        });
        return Response.json(problem, {
          status: problem.status,
          headers: { "content-type": "application/problem+json" },
        });
      }
    },
    websocket: {
      message(socket: Parameters<typeof graphQLWebSocket.message>[0], message: string | Buffer) {
        graphQLWebSocket.message(socket, message);
      },
      close(socket: Parameters<typeof graphQLWebSocket.close>[0]) {
        void graphQLWebSocket.close(socket);
      },
    },
  };
}

export function isGraphQLWebSocketRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.pathname === "/graphql" && request.headers.get("upgrade")?.toLowerCase() === "websocket"
  );
}

export function isClientDisconnectError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message === "The connection was closed.")
  );
}

export function installClientDisconnectHandlers(
  logger: Pick<ReturnType<typeof createLogger>, "debug" | "error">,
) {
  if (clientDisconnectHandlersInstalled) {
    return;
  }
  clientDisconnectHandlersInstalled = true;
  process.on("unhandledRejection", (reason) => {
    if (handleProcessClientDisconnect(reason, logger)) {
      return;
    }
    handleProcessFatalError("unhandled_rejection", reason, logger);
  });
  process.on("uncaughtException", (error) => {
    if (handleProcessClientDisconnect(error, logger)) {
      return;
    }
    handleProcessFatalError("uncaught_exception", error, logger);
  });
}

export function handleProcessClientDisconnect(
  reason: unknown,
  logger: Pick<ReturnType<typeof createLogger>, "debug">,
): boolean {
  if (!isClientDisconnectError(reason)) {
    return false;
  }
  logger.debug("client_disconnected", {
    message: "client_disconnected",
  });
  return true;
}

export function handleProcessFatalError(
  event: "uncaught_exception" | "unhandled_rejection",
  reason: unknown,
  logger: Pick<ReturnType<typeof createLogger>, "error">,
): void {
  logger.error(event, {
    ...logErrorFields(reason),
    error_id: "ERR-010",
    error_code: "RUNTIME_COMPOSITION_FAILED",
    message: "Unhandled backend runtime failure",
  });
  process.exit(1);
}

export function logErrorFields(error: unknown) {
  if (error instanceof Error || error instanceof DOMException) {
    return {
      error_name: error.name,
      detail: error.message,
      stack: error.stack || undefined,
    };
  }
  return {
    error_name: typeof error,
    detail: typeof error === "string" ? error : "Non-error value thrown",
  };
}
