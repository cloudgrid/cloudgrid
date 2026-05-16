import { createLogger } from "@cloudgrid/runtime";
import { loadConfig, startupProblem } from "./config";
import type { RuntimeConfig } from "./config";
import { createApp } from "./graphql";
import { createGraphQLWebSocketHandler } from "./graphql-ws";
import type { GraphQLWebSocketState } from "./graphql-ws";

export { NATSTelemetryQueryBridge, graphQLErrorFromBridge } from "./bridge";
export type {
  AiEvalBridge,
  CloudGridBridge,
  ControlPlaneBridge,
  MetricQueryBridge,
  TelemetryQueryBridge,
} from "./bridge";
export { loadConfig, startupProblem } from "./config";
export type { RuntimeConfig } from "./config";
export { createApp, createAppWithBridge, createCloudGridSchema } from "./graphql";
export { createGraphQLWebSocketHandler } from "./graphql-ws";
export { CloudGridAuthService } from "./auth";
export type { AuthProviderFixture, AuthenticatedPrincipal, NormalizedAuthContext } from "./auth";

if (import.meta.main) {
  await startServer();
}

export async function startServer() {
  const logger = createLogger("bff");
  try {
    const config = loadConfig();
    const { app, bridge } = await createApp(config, logger);
    const graphQLWebSocket = createGraphQLWebSocketHandler(bridge, logger, { auth: config.auth });
    const server = Bun.serve(createServeOptions(config, app, graphQLWebSocket));

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
        await bridge.close();
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
      graphql_ui: config.graphqlUI,
    });
  } catch (error) {
    const problem = startupProblem(error);
    logger.error("startup_failed", {
      error_id: problem.errorId,
      error_code: problem.errorCode,
      message: problem.message,
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
) {
  return {
    hostname: config.host,
    port: config.port,
    fetch: (
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
      return app.fetch(request);
    },
    websocket: {
      message(socket: Parameters<typeof graphQLWebSocket.message>[0], message: string | Buffer) {
        graphQLWebSocket.message(socket, message);
      },
      close(socket: Parameters<typeof graphQLWebSocket.close>[0]) {
        graphQLWebSocket.close(socket);
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
