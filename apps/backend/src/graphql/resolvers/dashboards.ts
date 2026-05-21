import type {
  DashboardListInput,
  ReorderDashboardPinsInput,
  SaveDashboardInput,
  SetDashboardPinnedInput,
} from "@cloudgrid/ui-contracts";
import {
  validateDashboardListInput,
  validateId,
  validateReorderDashboardPinsInput,
  validateSaveDashboardInput,
  validateSetDashboardPinnedInput,
} from "../../validation";
import {
  authContext,
  logGraphQLOperation,
  requireControlBridge,
  type ResolverContext,
} from "./context";

export function dashboardResolvers() {
  return {
    Query: {
      dashboards: async (
        _parent: unknown,
        args: { input?: DashboardListInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "dashboards", async () =>
          requireControlBridge(context).dashboards(
            validateDashboardListInput(args.input ?? {}),
            await authContext(context),
          ),
        ),
    },
    Mutation: {
      saveDashboard: async (
        _parent: unknown,
        args: { input: SaveDashboardInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "saveDashboard", async () =>
          requireControlBridge(context).saveDashboard(
            validateSaveDashboardInput(args.input),
            await authContext(context),
          ),
        ),
      deleteDashboard: async (_parent: unknown, args: { id: string }, context: ResolverContext) =>
        logGraphQLOperation(context, "deleteDashboard", async () =>
          requireControlBridge(context).deleteDashboard(
            validateId(args.id, "dashboard id"),
            await authContext(context),
          ),
        ),
      setDashboardPinned: async (
        _parent: unknown,
        args: { input: SetDashboardPinnedInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "setDashboardPinned", async () =>
          requireControlBridge(context).setDashboardPinned(
            validateSetDashboardPinnedInput(args.input),
            await authContext(context),
          ),
        ),
      reorderDashboardPins: async (
        _parent: unknown,
        args: { input: ReorderDashboardPinsInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "reorderDashboardPins", async () =>
          requireControlBridge(context).reorderDashboardPins(
            validateReorderDashboardPinsInput(args.input),
            await authContext(context),
          ),
        ),
    },
  };
}
