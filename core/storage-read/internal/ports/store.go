package ports

import (
	"context"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type TelemetryReadStore interface {
	GetProjectTelemetryOverviews(ctx context.Context, request contracts.ProjectTelemetryOverviewRequest) (contracts.ProjectTelemetryOverviewData, error)
	SearchTraces(ctx context.Context, query contracts.TraceSearchQuery, authContext *contracts.AuthContext) (contracts.TraceSearchData, error)
	SearchLiveTraceCandidates(ctx context.Context, query contracts.LiveTraceQuery, traceIDs []string, authContext *contracts.AuthContext) ([]contracts.TraceSummary, error)
	GetTraceDetail(ctx context.Context, traceID string, query *contracts.TraceDetailQuery, authContext *contracts.AuthContext) (*contracts.TraceDetailData, error)
	SearchLogs(ctx context.Context, query contracts.LogSearchQuery, authContext *contracts.AuthContext) (contracts.LogSearchData, error)
	GetTelemetryFacets(ctx context.Context, query contracts.TelemetryFacetQuery, authContext *contracts.AuthContext) (contracts.TelemetryFacetData, error)
	SearchMetricNames(ctx context.Context, input contracts.MetricNameSearchInput, authContext *contracts.AuthContext) (contracts.MetricNameSearchData, error)
	QueryMetricSeries(ctx context.Context, input contracts.MetricSeriesInput, authContext *contracts.AuthContext) (contracts.MetricSeriesData, error)
}

type AiEvalReadStore interface {
	QueryAiEval(ctx context.Context, subject string, input map[string]any) (map[string]any, error)
	ResolveExperimentManifest(ctx context.Context, request contracts.ExperimentManifestResolveRequest) (map[string]any, error)
	ResolveOnlinePolicyMatches(ctx context.Context, request contracts.OnlinePolicyMatchesResolveRequest) (contracts.OnlinePolicyMatchesResolveData, error)
	GetExperimentRunEventData(ctx context.Context, notification contracts.ExperimentProgressNotification) (map[string]any, map[string]any, error)
}
