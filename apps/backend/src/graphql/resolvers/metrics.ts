import type {
  MetricNameSearchInput,
  MetricSeriesInput,
  RichMetricSeriesInput,
} from "@cloudgrid/ui-contracts";
import {
  validateMetricNameSearchInput,
  validateMetricSeriesInput,
  validateRichMetricSeriesInput,
} from "../../validation";
import {
  authContext,
  logGraphQLOperation,
  requireMetricQueryBridge,
  type ResolverContext,
} from "./context";

export function metricsResolvers() {
  return {
    Query: {
      metricNames: async (
        _parent: unknown,
        args: { input?: MetricNameSearchInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "metricNames", async () =>
          requireMetricQueryBridge(context).metricNames(
            validateMetricNameSearchInput(args.input ?? {}),
            await authContext(context),
          ),
        ),
      metricSeries: async (
        _parent: unknown,
        args: { input: MetricSeriesInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "metricSeries", async () =>
          requireMetricQueryBridge(context).metricSeries(
            validateMetricSeriesInput(args.input),
            await authContext(context),
          ),
        ),
      richMetricSeries: async (
        _parent: unknown,
        args: { input: RichMetricSeriesInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "richMetricSeries", async () =>
          requireMetricQueryBridge(context).richMetricSeries(
            validateRichMetricSeriesInput(args.input),
            await authContext(context),
          ),
        ),
    },
  };
}
