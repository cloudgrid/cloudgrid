//go:build surrealdb

package surrealdb

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestBuildTraceSearchQueryUsesFiltersParametersAndDeterministicSort(t *testing.T) {
	limit := 25
	service := "api"
	status := contracts.TraceStatusError
	from := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	to := time.Date(2026, 5, 8, 9, 0, 0, 0, time.UTC)

	stmt, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{
		Service: &service,
		Status:  &status,
		From:    &from,
		To:      &to,
		Limit:   &limit,
	})
	if err != nil {
		t.Fatalf("BuildTraceSearchQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "SELECT traceId AS id")
	assertContains(t, stmt.SQL, "AS operationName")
	assertContains(t, stmt.SQL, "SELECT name, startedAt, spanId FROM span")
	assertContains(t, stmt.SQL, "parentSpanId = NONE")
	assertContains(t, stmt.SQL, "FROM trace")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "companyId = $companyId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertContains(t, stmt.SQL, "serviceName = $service")
	assertContains(t, stmt.SQL, "status = $status")
	assertContains(t, stmt.SQL, "startedAt >= $from")
	assertContains(t, stmt.SQL, "startedAt <= $to")
	assertContains(t, stmt.SQL, "ORDER BY startedAt DESC, traceId ASC")
	assertContains(t, stmt.SQL, "LIMIT $limit")
	assertNoMutation(t, stmt.SQL)

	if stmt.Params["service"] != service || stmt.Params["status"] != string(status) || stmt.Params["limit"] != limit {
		t.Fatalf("params = %#v, want service/status/limit", stmt.Params)
	}
	if stmt.Params["tenantId"] != "local" || stmt.Params["companyId"] != "local" || stmt.Params["projectId"] != "default" {
		t.Fatalf("params = %#v, want local ownership defaults", stmt.Params)
	}
	if stmt.Params["from"] != from || stmt.Params["to"] != to {
		t.Fatalf("params = %#v, want time bounds", stmt.Params)
	}
}

func TestBuildTraceSearchQueryFiltersByParticipatingSpanService(t *testing.T) {
	service := "payments"

	stmt, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{
		Service: &service,
	})
	if err != nil {
		t.Fatalf("BuildTraceSearchQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "traceId IN (SELECT VALUE traceId FROM span")
	assertContains(t, stmt.SQL, "serviceName = $service")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "companyId = $companyId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertNoMutation(t, stmt.SQL)
	if stmt.Params["service"] != service {
		t.Fatalf("params = %#v, want service", stmt.Params)
	}
}

func TestBuildProjectTelemetryOverviewQueriesUseOwnershipAndReadOnlyStatements(t *testing.T) {
	target := TelemetryTarget{TenantID: "tenant-1", CompanyID: "company-1", ProjectID: "project-1"}
	queries := BuildProjectTelemetryOverviewQueries(target)

	for name, stmt := range queries {
		assertContains(t, stmt.SQL, "tenantId = $tenantId")
		assertContains(t, stmt.SQL, "companyId = $companyId")
		assertContains(t, stmt.SQL, "projectId = $projectId")
		assertNoMutation(t, stmt.SQL)
		if stmt.Params["tenantId"] != "tenant-1" || stmt.Params["companyId"] != "company-1" || stmt.Params["projectId"] != "project-1" {
			t.Fatalf("%s params = %#v, want ownership params", name, stmt.Params)
		}
	}
	assertContains(t, queries["traces"].SQL, "FROM trace")
	assertContains(t, queries["traces"].SQL, "GROUP ALL")
	assertContains(t, queries["logs"].SQL, "FROM log_event")
	assertContains(t, queries["logs"].SQL, "GROUP ALL")
	assertContains(t, queries["metrics"].SQL, "FROM metric_descriptor")
	assertContains(t, queries["metrics"].SQL, "GROUP ALL")
	assertContains(t, queries["services"].SQL, "FROM service")
	assertContains(t, queries["services"].SQL, "GROUP ALL")
	assertContains(t, queries["lastIngest"].SQL, "FROM ingest_command")
	assertContains(t, queries["lastIngest"].SQL, "ORDER BY completedAt DESC")
}

func TestResolveProjectTelemetryTargetUsesExplicitProjectAndAuthTenant(t *testing.T) {
	authMode := "sso"
	tenantID := "tenant-1"
	target, err := ResolveProjectTelemetryTarget(contracts.ProjectTelemetryOverviewTarget{
		CompanyID: "company-1",
		ProjectID: "project-1",
	}, &contracts.AuthContext{AuthMode: &authMode, TenantID: &tenantID})
	if err != nil {
		t.Fatalf("ResolveProjectTelemetryTarget returned error: %v", err)
	}
	if target.TenantID != tenantID || target.CompanyID != "company-1" || target.ProjectID != "project-1" || target.AuthMode != deployedAuthMode {
		t.Fatalf("target = %#v, want auth tenant and explicit company/project", target)
	}
}

func TestResolveProjectTelemetryTargetRejectsUnsafeIdentifiers(t *testing.T) {
	_, err := ResolveProjectTelemetryTarget(contracts.ProjectTelemetryOverviewTarget{
		CompanyID: "company 1",
		ProjectID: "project-1",
	}, nil)
	if err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("ResolveProjectTelemetryTarget error = %v, want validation error", err)
	}
}

func TestBuildTraceSearchQueryUsesTrustedAuthContextOwnership(t *testing.T) {
	authMode := "sso"
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"

	stmt, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{}, &contracts.AuthContext{
		Mode:      "authenticated",
		AuthMode:  &authMode,
		TenantID:  &tenantID,
		CompanyID: &companyID,
		ProjectID: &projectID,
	})
	if err != nil {
		t.Fatalf("BuildTraceSearchQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "companyId = $companyId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	if stmt.Params["tenantId"] != tenantID || stmt.Params["companyId"] != companyID || stmt.Params["projectId"] != projectID {
		t.Fatalf("params = %#v, want trusted auth context ownership", stmt.Params)
	}
	if strings.Contains(stmt.SQL, tenantID) || strings.Contains(stmt.SQL, projectID) {
		t.Fatalf("ownership identifiers were interpolated into SQL:\n%s", stmt.SQL)
	}
}

func TestBuildLiveTraceCandidatesQueryNarrowsByTraceIDsAndLiveFilters(t *testing.T) {
	limit := 250
	service := "api"
	status := contracts.TraceStatusError
	from := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)

	stmt, err := BuildLiveTraceCandidatesQuery(contracts.LiveTraceQuery{
		Service:    &service,
		Status:     &status,
		From:       &from,
		Limit:      &limit,
		Attributes: []contracts.AttributeFilter{{Key: "env", Operator: contracts.AttributeFilterOperatorEQ, Value: "prod"}},
	}, []string{"trace-1", "trace-2"})
	if err != nil {
		t.Fatalf("BuildLiveTraceCandidatesQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "SELECT traceId AS id")
	assertContains(t, stmt.SQL, "AS operationName")
	assertContains(t, stmt.SQL, "SELECT name, startedAt, spanId FROM span")
	assertContains(t, stmt.SQL, "FROM trace")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "companyId = $companyId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertContains(t, stmt.SQL, "traceId IN $traceIds")
	assertContains(t, stmt.SQL, "serviceName = $service")
	assertContains(t, stmt.SQL, "status = $status")
	assertContains(t, stmt.SQL, "startedAt >= $from")
	assertContains(t, stmt.SQL, "attributes[$attributeKey0] = $attributeValue0")
	assertContains(t, stmt.SQL, "ORDER BY startedAt DESC, traceId ASC")
	assertContains(t, stmt.SQL, "LIMIT $limit")
	assertNoMutation(t, stmt.SQL)

	if stmt.Params["limit"] != limit || stmt.Params["service"] != service || stmt.Params["status"] != string(status) {
		t.Fatalf("params = %#v, want live filter params", stmt.Params)
	}
	traceIDs, ok := stmt.Params["traceIds"].([]string)
	if !ok || len(traceIDs) != 2 || traceIDs[0] != "trace-1" || traceIDs[1] != "trace-2" {
		t.Fatalf("traceIds param = %#v, want notification trace IDs", stmt.Params["traceIds"])
	}
}

func TestBuildLiveTraceCandidatesQueryFiltersByParticipatingSpanService(t *testing.T) {
	service := "payments"

	stmt, err := BuildLiveTraceCandidatesQuery(contracts.LiveTraceQuery{
		Service: &service,
	}, []string{"trace-1"})
	if err != nil {
		t.Fatalf("BuildLiveTraceCandidatesQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "traceId IN $traceIds")
	assertContains(t, stmt.SQL, "traceId IN (SELECT VALUE traceId FROM span")
	assertContains(t, stmt.SQL, "serviceName = $service")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "companyId = $companyId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertNoMutation(t, stmt.SQL)
	if stmt.Params["service"] != service {
		t.Fatalf("params = %#v, want service", stmt.Params)
	}
}

func TestBuildTraceSearchQueryAppliesCursorPredicate(t *testing.T) {
	cursorTime := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	cursor := encodeCursor(t, "startedAt_desc_traceId_asc", cursorTime.Format(time.RFC3339Nano), "trace-9")

	stmt, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Cursor: &cursor})
	if err != nil {
		t.Fatalf("BuildTraceSearchQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "startedAt < $cursorValue")
	assertContains(t, stmt.SQL, "startedAt = $cursorValue AND traceId > $cursorId")
	if stmt.Params["cursorValue"] != cursorTime || stmt.Params["cursorId"] != "trace-9" {
		t.Fatalf("params = %#v, want decoded trace cursor", stmt.Params)
	}
}

func TestBuildTraceDetailQueryUsesTraceIDAndReadOnlyStatements(t *testing.T) {
	stmt, err := BuildTraceDetailQuery(contracts.TraceDetailRequest{TraceID: "abc123"})
	if err != nil {
		t.Fatalf("BuildTraceDetailQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "SELECT traceId AS id")
	assertContains(t, stmt.SQL, "startedAtUnixNano")
	assertContains(t, stmt.SQL, "durationNano")
	assertContains(t, stmt.SQL, "FROM trace")
	assertContains(t, stmt.SQL, "traceId = $traceId")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertContains(t, stmt.SQL, "FROM span")
	assertContains(t, stmt.SQL, "ORDER BY startedAt ASC, spanId ASC")
	assertContains(t, stmt.SQL, "FROM log_event")
	assertContains(t, stmt.SQL, "traceId = $traceId")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertContains(t, stmt.SQL, "spanId IN $spanIds")
	assertContains(t, stmt.SQL, "timestamp >= $contextFrom")
	assertContains(t, stmt.SQL, "timestamp <= $contextTo")
	assertNoMutation(t, stmt.SQL)

	if stmt.Params["traceId"] != "abc123" {
		t.Fatalf("params = %#v, want traceId", stmt.Params)
	}
}

func TestBuildLogsForTraceDetailQueryIncludesTraceSpanAndContextMatches(t *testing.T) {
	service := "api"
	trace := contracts.Trace{
		ID:          "abc123",
		ServiceName: &service,
		StartedAt:   time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
		Attributes:  contracts.Attributes{},
	}
	spans := []contracts.Span{{ID: "span-1", TraceID: trace.ID, ServiceName: &service}}

	stmt, err := BuildLogsForTraceDetailQuery(trace, spans)
	if err != nil {
		t.Fatalf("BuildLogsForTraceDetailQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "traceId = $traceId")
	assertContains(t, stmt.SQL, "spanId IN $spanIds")
	assertContains(t, stmt.SQL, "serviceName IN $services")
	assertContains(t, stmt.SQL, "timestamp >= $contextFrom")
	assertContains(t, stmt.SQL, "timestamp <= $contextTo")
	assertNoMutation(t, stmt.SQL)
	if stmt.Params["traceId"] != "abc123" {
		t.Fatalf("params = %#v, want traceId", stmt.Params)
	}
}

func TestBuildFacetQueriesUseBoundedReadOnlyStatements(t *testing.T) {
	limit := 10
	service := "api"
	search := "err"
	from := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	to := time.Date(2026, 5, 8, 9, 0, 0, 0, time.UTC)

	stmts, err := BuildFacetQueries(contracts.TelemetryFacetQuery{
		From:    &from,
		To:      &to,
		Service: &service,
		Search:  &search,
		Limit:   &limit,
	})
	if err != nil {
		t.Fatalf("BuildFacetQueries returned error: %v", err)
	}
	if len(stmts) != 5 {
		t.Fatalf("statement count = %d, want 5", len(stmts))
	}
	for name, stmt := range stmts {
		assertContains(t, stmt.SQL, "tenantId = $tenantId")
		assertContains(t, stmt.SQL, "projectId = $projectId")
		assertNoMutation(t, stmt.SQL)
		if name == "attributeKeys" {
			assertContains(t, stmt.SQL, "LIMIT $attributeScanLimit")
			if stmt.Params["attributeScanLimit"] != attributeKeyFacetScanLimit {
				t.Fatalf("%s params = %#v, want attribute scan limit", name, stmt.Params)
			}
			continue
		}
		assertContains(t, stmt.SQL, "LIMIT $limit")
		assertContains(t, stmt.SQL, "ORDER BY count DESC, value ASC")
		if stmt.Params["limit"] != limit || stmt.Params["service"] != service || stmt.Params["search"] != search {
			t.Fatalf("%s params = %#v, want common facet params", name, stmt.Params)
		}
	}
	assertContains(t, stmts["services"].SQL, "FROM span")
	assertContains(t, stmts["operations"].SQL, "parentSpanId = NONE")
	assertContains(t, stmts["spanNames"].SQL, "name AS value")
	assertContains(t, stmts["severities"].SQL, "FROM log_event")
	assertContains(t, stmts["attributeKeys"].SQL, "object::keys(attributes)")
	if strings.Contains(stmts["attributeKeys"].SQL, "SPLIT") || strings.Contains(stmts["attributeKeys"].SQL, "GROUP BY") {
		t.Fatalf("attribute key facet query must not combine SPLIT and GROUP in SurrealDB v3:\n%s", stmts["attributeKeys"].SQL)
	}
}

func TestBuildLogSearchQueryUsesFiltersParametersAndTextSearch(t *testing.T) {
	limit := 100
	service := "worker"
	traceID := "trace-1"
	spanID := "span-1"
	severity := "ERROR"
	search := "timeout"

	stmt, err := BuildLogSearchQuery(contracts.LogSearchQuery{
		Service:  &service,
		TraceID:  &traceID,
		SpanID:   &spanID,
		Severity: &severity,
		Search:   &search,
		Limit:    &limit,
	})
	if err != nil {
		t.Fatalf("BuildLogSearchQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "SELECT logEventId AS id")
	assertContains(t, stmt.SQL, "FROM log_event")
	assertContains(t, stmt.SQL, "tenantId = $tenantId")
	assertContains(t, stmt.SQL, "companyId = $companyId")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertContains(t, stmt.SQL, "serviceName = $service")
	assertContains(t, stmt.SQL, "traceId = $traceId")
	assertContains(t, stmt.SQL, "spanId = $spanId")
	assertContains(t, stmt.SQL, "severityText = $severity")
	assertContains(t, stmt.SQL, "string::lowercase(bodyText) CONTAINS $search")
	assertContains(t, stmt.SQL, "ORDER BY timestamp DESC, logEventId ASC")
	assertContains(t, stmt.SQL, "LIMIT $limit")
	assertNoMutation(t, stmt.SQL)

	if stmt.Params["search"] != "timeout" {
		t.Fatalf("params = %#v, want lowercase search", stmt.Params)
	}
}

func TestBuildLogSearchQueryAppliesCursorPredicate(t *testing.T) {
	cursorTime := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	cursor := encodeCursor(t, "timestamp_desc_logEventId_asc", cursorTime.Format(time.RFC3339Nano), "log-9")

	stmt, err := BuildLogSearchQuery(contracts.LogSearchQuery{Cursor: &cursor})
	if err != nil {
		t.Fatalf("BuildLogSearchQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "timestamp < $cursorValue")
	assertContains(t, stmt.SQL, "timestamp = $cursorValue AND logEventId > $cursorId")
	if stmt.Params["cursorValue"] != cursorTime || stmt.Params["cursorId"] != "log-9" {
		t.Fatalf("params = %#v, want decoded log cursor", stmt.Params)
	}
}

func TestQueryBuildersRejectInvalidLimitsAndRanges(t *testing.T) {
	limit := 201
	if _, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Limit: &limit}); err == nil {
		t.Fatal("BuildTraceSearchQuery accepted limit above 200")
	}

	from := time.Date(2026, 5, 8, 9, 0, 0, 0, time.UTC)
	to := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	if _, err := BuildLogSearchQuery(contracts.LogSearchQuery{From: &from, To: &to}); err == nil {
		t.Fatal("BuildLogSearchQuery accepted from after to")
	}

	cursor := "not-base64-json"
	if _, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Cursor: &cursor}); err == nil {
		t.Fatal("BuildTraceSearchQuery accepted malformed cursor")
	}
}

func encodeCursor(t *testing.T, sort string, lastValue string, lastID string) string {
	t.Helper()
	payload, err := json.Marshal(map[string]string{
		"sort":      sort,
		"lastValue": lastValue,
		"lastId":    lastID,
	})
	if err != nil {
		t.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(payload)
}

func assertContains(t *testing.T, haystack, needle string) {
	t.Helper()
	if !strings.Contains(haystack, needle) {
		t.Fatalf("SQL %q does not contain %q", haystack, needle)
	}
}

func assertNoMutation(t *testing.T, sql string) {
	t.Helper()
	upper := strings.ToUpper(sql)
	for _, forbidden := range []string{"CREATE ", "UPDATE ", "DELETE ", "DEFINE ", "UPSERT ", "INSERT ", "MERGE ", "PATCH ", "RELATE "} {
		if strings.Contains(upper, forbidden) {
			t.Fatalf("SQL contains forbidden mutation keyword %q: %s", forbidden, sql)
		}
	}
}
