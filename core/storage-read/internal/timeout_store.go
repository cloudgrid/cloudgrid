package internal

import (
	"context"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
)

type timeoutTelemetryReadStore struct {
	inner   ports.TelemetryReadStore
	timeout time.Duration
}

func WithQueryTimeout(store ports.TelemetryReadStore, timeout time.Duration) ports.TelemetryReadStore {
	if timeout <= 0 {
		return store
	}
	if aiEvalStore, ok := store.(ports.AiEvalReadStore); ok {
		return timeoutAiEvalReadStore{
			timeoutTelemetryReadStore: timeoutTelemetryReadStore{inner: store, timeout: timeout},
			aiEval:                    aiEvalStore,
		}
	}
	return timeoutTelemetryReadStore{inner: store, timeout: timeout}
}

type timeoutAiEvalReadStore struct {
	timeoutTelemetryReadStore
	aiEval ports.AiEvalReadStore
}

func (store timeoutAiEvalReadStore) QueryAiEval(ctx context.Context, subject string, input map[string]any) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.aiEval.QueryAiEval(ctx, subject, input)
}

func (store timeoutAiEvalReadStore) ResolveExperimentManifest(ctx context.Context, request contracts.ExperimentManifestResolveRequest) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.aiEval.ResolveExperimentManifest(ctx, request)
}

func (store timeoutAiEvalReadStore) ResolveOnlinePolicyMatches(ctx context.Context, request contracts.OnlinePolicyMatchesResolveRequest) (contracts.OnlinePolicyMatchesResolveData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.aiEval.ResolveOnlinePolicyMatches(ctx, request)
}

func (store timeoutAiEvalReadStore) GetExperimentRunEventData(ctx context.Context, notification contracts.ExperimentProgressNotification) (map[string]any, map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.aiEval.GetExperimentRunEventData(ctx, notification)
}

func (store timeoutTelemetryReadStore) GetProjectTelemetryOverviews(ctx context.Context, request contracts.ProjectTelemetryOverviewRequest) (contracts.ProjectTelemetryOverviewData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.GetProjectTelemetryOverviews(ctx, request)
}

func (store timeoutTelemetryReadStore) SearchTraces(ctx context.Context, query contracts.TraceSearchQuery, authContext *contracts.AuthContext) (contracts.TraceSearchData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.SearchTraces(ctx, query, authContext)
}

func (store timeoutTelemetryReadStore) SearchLiveTraceCandidates(ctx context.Context, query contracts.LiveTraceQuery, traceIDs []string, authContext *contracts.AuthContext) ([]contracts.TraceSummary, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.SearchLiveTraceCandidates(ctx, query, traceIDs, authContext)
}

func (store timeoutTelemetryReadStore) GetTraceDetail(ctx context.Context, traceID string, query *contracts.TraceDetailQuery, authContext *contracts.AuthContext) (*contracts.TraceDetailData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.GetTraceDetail(ctx, traceID, query, authContext)
}

func (store timeoutTelemetryReadStore) SearchLogs(ctx context.Context, query contracts.LogSearchQuery, authContext *contracts.AuthContext) (contracts.LogSearchData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.SearchLogs(ctx, query, authContext)
}

func (store timeoutTelemetryReadStore) GetTelemetryFacets(ctx context.Context, query contracts.TelemetryFacetQuery, authContext *contracts.AuthContext) (contracts.TelemetryFacetData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.GetTelemetryFacets(ctx, query, authContext)
}

func (store timeoutTelemetryReadStore) SearchMetricNames(ctx context.Context, input contracts.MetricNameSearchInput, authContext *contracts.AuthContext) (contracts.MetricNameSearchData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.SearchMetricNames(ctx, input, authContext)
}

func (store timeoutTelemetryReadStore) QueryMetricSeries(ctx context.Context, input contracts.MetricSeriesInput, authContext *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	ctx, cancel := context.WithTimeout(ctx, store.timeout)
	defer cancel()
	return store.inner.QueryMetricSeries(ctx, input, authContext)
}
