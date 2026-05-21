import type {
  LiveTraceInput,
  LogSearchInput,
  TelemetryFacetInput,
  TraceDetailInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import { requireScopes } from "../../auth";
import {
  validateLiveTraceInput,
  validateLogSearchInput,
  validateTelemetryFacetInput,
  validateTraceDetailInput,
  validateTraceId,
  validateTraceSearchInput,
} from "../../validation";
import { authContext, logGraphQLOperation, type ResolverContext } from "./context";

export function telemetryResolvers() {
  return {
    Query: {
      traces: async (
        _parent: unknown,
        args: { input?: TraceSearchInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "traces", async () =>
          context.hono
            .get("bridge")
            .searchTraces(validateTraceSearchInput(args.input ?? {}), await authContext(context)),
        ),
      trace: async (
        _parent: unknown,
        args: { id: string; input?: TraceDetailInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "trace", async () =>
          context.hono
            .get("bridge")
            .getTraceDetail(
              validateTraceId(args.id),
              validateTraceDetailInput(args.input ?? {}),
              await authContext(context),
            ),
        ),
      logs: async (_parent: unknown, args: { input?: LogSearchInput }, context: ResolverContext) =>
        logGraphQLOperation(context, "logs", async () =>
          context.hono
            .get("bridge")
            .searchLogs(validateLogSearchInput(args.input ?? {}), await authContext(context)),
        ),
      telemetryFacets: async (
        _parent: unknown,
        args: { input?: TelemetryFacetInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "telemetryFacets", async () =>
          context.hono
            .get("bridge")
            .telemetryFacets(
              validateTelemetryFacetInput(args.input ?? {}),
              await authContext(context),
            ),
        ),
    },
    Subscription: {
      liveTraces: {
        subscribe: (_parent: unknown, args: { input?: LiveTraceInput }, context: ResolverContext) =>
          logGraphQLOperation(context, "liveTraces", async () => {
            const auth = await authContext(context);
            requireScopes(auth, ["telemetry:read", "telemetry:live"]);
            return context.hono
              .get("bridge")
              .subscribeLiveTraces(validateLiveTraceInput(args.input ?? {}), auth);
          }),
        resolve: (event: unknown) => event,
      },
    },
  };
}
