//go:build surrealdb

package surrealdb

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestMetricHelperBranches(t *testing.T) {
	originalLimit := maxMetricPointLimit
	t.Cleanup(func() { maxMetricPointLimit = originalLimit })

	ConfigureMetricLimits(7)
	limit := 8
	if _, err := normalizedMetricPointLimit(&limit); err == nil || !strings.Contains(err.Error(), "between 1 and 7") {
		t.Fatalf("normalizedMetricPointLimit() error = %v, want configured max", err)
	}

	if got := surrealDurationLiteral(100 * time.Millisecond); got != "1s" {
		t.Fatalf("surrealDurationLiteral() = %q, want 1s", got)
	}

	from := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	to := from.Add(30 * time.Minute)
	interval, err := resolveMetricInterval(nil, from, to)
	if err != nil {
		t.Fatalf("resolveMetricInterval(nil) error = %v", err)
	}
	if interval != 6*time.Second {
		t.Fatalf("auto interval = %s, want 6s", interval)
	}
	zero := "0s"
	if _, err := resolveMetricInterval(&zero, from, to); err == nil || !strings.Contains(err.Error(), "positive") {
		t.Fatalf("resolveMetricInterval(0s) error = %v, want positive validation", err)
	}

	selects := map[contracts.MetricAggregation]string{
		contracts.MetricAggregationMin:   "math::min(value)",
		contracts.MetricAggregationMax:   "math::max(value)",
		contracts.MetricAggregationCount: "count() AS value",
		contracts.MetricAggregationRate:  "math::sum(value) / $intervalSeconds",
		contracts.MetricAggregationP50:   "percentile",
		contracts.MetricAggregationP90:   "90",
		contracts.MetricAggregationP95:   "95",
		contracts.MetricAggregationP99:   "99",
	}
	for aggregation, want := range selects {
		if got := metricAggregationSelect(aggregation, contracts.MetricKindGauge); !strings.Contains(got, want) {
			t.Fatalf("metricAggregationSelect(%s) = %q, want contains %q", aggregation, got, want)
		}
	}
	if got := metricAggregationSelect(contracts.MetricAggregationAvg, contracts.MetricKindHistogram); !strings.Contains(got, "math::sum(sum) / math::sum(count)") {
		t.Fatalf("histogram avg select = %q", got)
	}
	if got := metricAggregationSelect(contracts.MetricAggregationSum, contracts.MetricKindSummary); !strings.Contains(got, "math::sum(sum)") {
		t.Fatalf("summary sum select = %q", got)
	}
	if got := metricAggregationSelect(contracts.MetricAggregation("bogus"), contracts.MetricKindGauge); !strings.Contains(got, "count() AS value") {
		t.Fatalf("default select = %q", got)
	}
}

func TestCursorAndWhereHelperBranches(t *testing.T) {
	if clause := whereClause(nil); clause != "" {
		t.Fatalf("whereClause(nil) = %q, want empty", clause)
	}
	if cursor := pageCursor("sort", time.Time{}, "id"); cursor != nil {
		t.Fatalf("pageCursor with zero time = %#v, want nil", cursor)
	}
	encoded := pageCursor("sort", time.Date(2026, 5, 8, 8, 0, 0, 123, time.UTC), "row-1")
	if encoded == nil {
		t.Fatal("pageCursor() = nil")
	}
	decoded, err := decodeCursor(*encoded, "sort")
	if err != nil {
		t.Fatalf("decodeCursor() error = %v", err)
	}
	if decoded.LastID != "row-1" || decoded.LastValue.Nanosecond() != 123 {
		t.Fatalf("decoded cursor = %#v", decoded)
	}
	if _, err := decodeCursor(*encoded, "other"); err == nil || !strings.Contains(err.Error(), "ERR-003") {
		t.Fatalf("decodeCursor(wrong sort) error = %v, want ERR-003", err)
	}
}

func TestAiEvalPureHelperBranches(t *testing.T) {
	if got := intValueFromAny(json.Number("42")); got != 42 {
		t.Fatalf("intValueFromAny(json.Number) = %d, want 42", got)
	}
	if got := intValueFromAny(json.Number("nope")); got != 0 {
		t.Fatalf("intValueFromAny(invalid json.Number) = %d, want 0", got)
	}
	if got := defaultAny(nil, "fallback"); got != "fallback" {
		t.Fatalf("defaultAny(nil) = %#v", got)
	}
	if got := boolValue(map[string]any{"enabled": true}, "enabled"); !got {
		t.Fatal("boolValue() = false, want true")
	}
	policies := onlinePolicies([]any{map[string]any{"id": "policy-1"}, "ignored"})
	if len(policies) != 1 || policies[0]["id"] != "policy-1" {
		t.Fatalf("onlinePolicies() = %#v", policies)
	}
	if got := onlinePolicyVersion(map[string]any{"version": 0.0}); got != 1 {
		t.Fatalf("onlinePolicyVersion() = %d, want default 1", got)
	}
	if got := anySlice([]string{"a"}); got != nil {
		t.Fatalf("anySlice([]string) = %#v, want nil", got)
	}
	if got := stringSlice([]any{" dev ", "", 7}); len(got) != 1 || got[0] != "dev" {
		t.Fatalf("stringSlice() = %#v", got)
	}
}

func TestOnlinePolicyTargetMatchingBranches(t *testing.T) {
	routePrefix := "/api/"
	target := contracts.OnlinePolicyTarget{
		RoutePrefix: &routePrefix,
		Attributes: []contracts.OnlinePolicyAttributeFilter{{
			Key:      "tier",
			Operator: contracts.AttributeFilterOperatorIN,
			Value:    []any{"gold", "silver"},
		}},
	}
	route := "/api/orders"
	projection := contracts.OnlinePolicyProjectionReadModel{
		Route:          &route,
		SafeAttributes: map[string]any{"tier": "gold"},
	}
	if !onlinePolicyTargetMatchesProjection(target, projection) {
		t.Fatal("onlinePolicyTargetMatchesProjection() = false, want true")
	}
	route = "/internal/orders"
	if onlinePolicyTargetMatchesProjection(target, projection) {
		t.Fatal("onlinePolicyTargetMatchesProjection() = true for route prefix mismatch")
	}

	filters := onlineAttributeFilters([]any{
		map[string]any{"key": "tier", "operator": "not_in", "value": []any{"bronze"}},
		map[string]any{"key": "", "operator": "eq"},
	})
	if len(filters) != 1 || filters[0].Operator != contracts.AttributeFilterOperatorNotIN {
		t.Fatalf("onlineAttributeFilters() = %#v", filters)
	}
	if !onlineAttributeFilterMatches(map[string]any{"tier": "gold"}, filters[0]) {
		t.Fatal("not_in filter should match value outside list")
	}
	if onlineAttributeFilterMatches(map[string]any{}, contracts.OnlinePolicyAttributeFilter{Key: "x", Operator: contracts.AttributeFilterOperator("unknown")}) {
		t.Fatal("unknown operator matched")
	}
}

func TestQueryLimitTenancyAndQueryBuilderBranches(t *testing.T) {
	originalLimit := maxPageLimit
	t.Cleanup(func() { maxPageLimit = originalLimit })
	ConfigureQueryLimits(3)
	limit := 4
	if _, err := normalizedLimit(&limit); err == nil || !strings.Contains(err.Error(), "between 1 and 3") {
		t.Fatalf("normalizedLimit() error = %v, want configured max", err)
	}

	localTenant := "tenant_1"
	localCompany := "company_1"
	localProject := "project_1"
	target, err := ResolveTelemetryTarget(&contracts.AuthContext{TenantID: &localTenant, CompanyID: &localCompany, ProjectID: &localProject})
	if err != nil {
		t.Fatalf("ResolveTelemetryTarget(local override) error = %v", err)
	}
	if target.Namespace != localNamespace || target.Database != "project_project_1" || target.TenantID != localTenant {
		t.Fatalf("local target = %#v", target)
	}
	badAuthMode := "token"
	if _, err := ResolveTelemetryTarget(&contracts.AuthContext{AuthMode: &badAuthMode}); err == nil || !strings.Contains(err.Error(), "authMode is invalid") {
		t.Fatalf("ResolveTelemetryTarget(bad auth) error = %v", err)
	}
	sso := "sso"
	if _, err := ResolveTelemetryTarget(&contracts.AuthContext{AuthMode: &sso, CompanyID: &localCompany, ProjectID: &localProject}); err == nil || !strings.Contains(err.Error(), "tenantId is required") {
		t.Fatalf("ResolveTelemetryTarget(missing tenant) error = %v", err)
	}
	if _, err := ResolveProjectTelemetryTarget(contracts.ProjectTelemetryOverviewTarget{TenantID: &localTenant, CompanyID: "company_1", ProjectID: "project_1"}, &contracts.AuthContext{AuthMode: &sso, TenantID: ptrString("other")}); err == nil || !strings.Contains(err.Error(), "FORBIDDEN") {
		t.Fatalf("ResolveProjectTelemetryTarget(mismatch) error = %v", err)
	}

	from := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	cursor := pageCursor("timestamp_desc_logEventId_asc", from.Add(30*time.Minute), "log-1")
	service := "api"
	traceID := "trace-1"
	spanID := "span-1"
	severity := "ERROR"
	search := " Timeout "
	logStmt, err := BuildLogSearchQuery(contracts.LogSearchQuery{
		Service:  &service,
		TraceID:  &traceID,
		SpanID:   &spanID,
		Severity: &severity,
		From:     &from,
		To:       &to,
		Search:   &search,
		Cursor:   cursor,
	})
	if err != nil {
		t.Fatalf("BuildLogSearchQuery() error = %v", err)
	}
	for _, want := range []string{"serviceName = $service", "traceId = $traceId", "spanId = $spanId", "severityText = $severity", "timestamp >= $from", "timestamp <= $to", "bodyText", "timestamp < $cursorValue"} {
		if !strings.Contains(logStmt.SQL, want) {
			t.Fatalf("log SQL = %s, missing %q", logStmt.SQL, want)
		}
	}
	if logStmt.Params["search"] != "timeout" {
		t.Fatalf("search param = %#v", logStmt.Params["search"])
	}

	traceCursor := pageCursor("startedAt_desc_traceId_asc", from, "trace-1")
	status := contracts.TraceStatusError
	traceStmt, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Service: &service, Status: &status, From: &from, To: &to, Cursor: traceCursor})
	if err != nil {
		t.Fatalf("BuildTraceSearchQuery() error = %v", err)
	}
	for _, want := range []string{participatingSpanServiceCondition(), "status = $status", "startedAt >= $from", "startedAt <= $to", "startedAt < $cursorValue"} {
		if !strings.Contains(traceStmt.SQL, want) {
			t.Fatalf("trace SQL = %s, missing %q", traceStmt.SQL, want)
		}
	}

	facetStmt, err := BuildFacetQueries(contracts.TelemetryFacetQuery{Service: &service, From: &from, To: &to, Search: &search})
	if err != nil {
		t.Fatalf("BuildFacetQueries() error = %v", err)
	}
	if !strings.Contains(facetStmt["services"].SQL, "string::lowercase(name) CONTAINS $search") {
		t.Fatalf("facet services SQL = %s", facetStmt["services"].SQL)
	}
	if strings.Contains(facetStmt["attributeKeys"].SQL, "$search") {
		t.Fatalf("attribute key facet SQL should not include text search: %s", facetStmt["attributeKeys"].SQL)
	}

	detailStmt, err := BuildTraceDetailQuery(contracts.TraceDetailRequest{TraceID: " trace-1 "})
	if err != nil {
		t.Fatalf("BuildTraceDetailQuery() error = %v", err)
	}
	if !strings.Contains(detailStmt.SQL, "LET $trace") || detailStmt.Params["traceId"] != "trace-1" {
		t.Fatalf("detail statement = %#v", detailStmt)
	}
}

func TestTraceDetailStructureEdgeBranches(t *testing.T) {
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	missingRoot := "missing-root"
	spans := make([]contracts.Span, 0, 200)
	for index := 0; index < 200; index++ {
		spans = append(spans, contracts.Span{
			ID:         "span-" + strconv.Itoa(index),
			TraceID:    "trace-large",
			Name:       "work",
			StartedAt:  base,
			EndedAt:    base.Add(time.Millisecond),
			Attributes: contracts.Attributes{},
		})
	}
	trace := contracts.Trace{ID: "trace-large", RootSpanID: &missingRoot, StartedAt: base, Attributes: contracts.Attributes{}}
	rootIDs, orphanIDs, warnings := deriveRootsAndOrphans(trace, spans, map[string]bool{})
	if len(rootIDs) != 200 || len(orphanIDs) != 0 {
		t.Fatalf("roots=%d orphans=%d", len(rootIDs), len(orphanIDs))
	}
	foundLarge := false
	foundMissingRoot := false
	for _, warning := range warnings {
		if warning.Code == "largeTracePreview" {
			foundLarge = true
		}
		if warning.Code == "missingRoot" {
			foundMissingRoot = true
		}
	}
	if !foundLarge || !foundMissingRoot {
		t.Fatalf("warnings = %#v, want largeTracePreview and missingRoot", warnings)
	}

	service := "api"
	parent := contracts.Span{ID: "parent", ServiceName: &service}
	child := contracts.Span{ID: "child", ParentSpanID: &parent.ID, ServiceName: &service}
	if parentServiceDiffers(child, []contracts.Span{parent, child}) {
		t.Fatal("parentServiceDiffers() = true for matching service")
	}
	if findSpan([]contracts.Span{parent}, "missing") != nil {
		t.Fatal("findSpan() found missing span")
	}
	if nonNegativeDurationNanoString(base, base.Add(-time.Second)) != "0" {
		t.Fatal("nonNegativeDurationNanoString() did not clamp negative duration")
	}
	if optionalBool(true) == nil || *optionalBool(false) != false {
		t.Fatal("optionalBool() did not return bool pointers")
	}
}
