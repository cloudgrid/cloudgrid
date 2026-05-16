package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestNATSHandlerCompletionLogUsesJSONShape(t *testing.T) {
	var out bytes.Buffer
	logger := storageReadTestLogger(&out)
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-read-1"},
		Query:          contracts.TraceSearchQuery{},
	}
	data, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}

	handleTraceSearch(&loggingReadStore{}, logger)(bridgeMessageForTest(SubjectTraceSearch, data))

	entry := decodeStorageReadLog(t, out.Bytes())
	for _, key := range []string{"timestamp", "level", "service", "event", "request_id", "message", "operation_or_subject", "status", "duration_ms"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log missing key %q: %#v", key, entry)
		}
	}
	if entry["event"] != "nats_handler_completed" || entry["request_id"] != "req-read-1" || entry["operation_or_subject"] != SubjectTraceSearch || entry["status"] != "ok" {
		t.Fatalf("completion log = %#v", entry)
	}
	line := string(out.Bytes())
	for _, forbidden := range []string{"SELECT ", "password", "body"} {
		if strings.Contains(line, forbidden) {
			t.Fatalf("completion log contains forbidden detail %q: %s", forbidden, line)
		}
	}
}

type loggingReadStore struct{}

var (
	lastTraceDetailQuery  *contracts.TraceDetailQuery
	lastFacetQuery        contracts.TelemetryFacetQuery
	lastMetricNameInput   contracts.MetricNameSearchInput
	lastMetricSeriesInput contracts.MetricSeriesInput
)

func (store *loggingReadStore) GetProjectTelemetryOverviews(_ context.Context, request contracts.ProjectTelemetryOverviewRequest) (contracts.ProjectTelemetryOverviewData, error) {
	items := make([]contracts.ProjectTelemetryOverviewItem, 0, len(request.Projects))
	for _, project := range request.Projects {
		tenantID := "local"
		if project.TenantID != nil {
			tenantID = *project.TenantID
		}
		items = append(items, contracts.ProjectTelemetryOverviewItem{
			TenantID:  tenantID,
			CompanyID: project.CompanyID,
			ProjectID: project.ProjectID,
			Telemetry: contracts.ProjectTelemetryOverview{},
		})
	}
	return contracts.ProjectTelemetryOverviewData{Items: items}, nil
}

func (store *loggingReadStore) SearchTraces(_ context.Context, _ contracts.TraceSearchQuery) (contracts.TraceSearchData, error) {
	return contracts.TraceSearchData{Items: []contracts.TraceSummary{}}, nil
}

func (store *loggingReadStore) SearchLiveTraceCandidates(_ context.Context, _ contracts.LiveTraceQuery, _ []string) ([]contracts.TraceSummary, error) {
	return []contracts.TraceSummary{}, nil
}

func (store *loggingReadStore) GetTraceDetail(_ context.Context, _ string, query *contracts.TraceDetailQuery) (*contracts.TraceDetailData, error) {
	lastTraceDetailQuery = query
	return &contracts.TraceDetailData{}, nil
}

func (store *loggingReadStore) SearchLogs(_ context.Context, _ contracts.LogSearchQuery) (contracts.LogSearchData, error) {
	return contracts.LogSearchData{Items: []contracts.LogEvent{}}, nil
}

func (store *loggingReadStore) GetTelemetryFacets(_ context.Context, query contracts.TelemetryFacetQuery) (contracts.TelemetryFacetData, error) {
	lastFacetQuery = query
	return contracts.TelemetryFacetData{Services: []contracts.FacetValue{}}, nil
}

func (store *loggingReadStore) SearchMetricNames(_ context.Context, input contracts.MetricNameSearchInput, _ *contracts.AuthContext) (contracts.MetricNameSearchData, error) {
	lastMetricNameInput = input
	return contracts.MetricNameSearchData{Items: []contracts.MetricDescriptor{}}, nil
}

func (store *loggingReadStore) QueryMetricSeries(_ context.Context, input contracts.MetricSeriesInput, _ *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	lastMetricSeriesInput = input
	return contracts.MetricSeriesData{Metric: contracts.MetricDescriptor{Name: input.MetricName}, Aggregation: input.Aggregation, GroupBy: input.GroupBy, Series: []contracts.MetricSeries{}, Warnings: []contracts.MetricQueryWarning{}}, nil
}

func storageReadTestLogger(output io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(output, &slog.HandlerOptions{
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			switch attr.Key {
			case slog.TimeKey:
				attr.Key = "timestamp"
			case slog.MessageKey:
				attr.Key = "message"
			case slog.LevelKey:
				attr.Value = slog.StringValue(strings.ToLower(attr.Value.String()))
			}
			return attr
		},
	}))
}

func decodeStorageReadLog(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(data), &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, string(data))
	}
	return entry
}
