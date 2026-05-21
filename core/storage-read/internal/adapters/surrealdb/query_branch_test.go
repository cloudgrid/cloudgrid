//go:build surrealdb

package surrealdb

import (
	"fmt"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestBuildLiveTraceCandidatesQueryIncludesOptionalBranchFilters(t *testing.T) {
	queryText := "  Checkout Timeout  "
	operationName := "GET /checkout"
	spanName := "SELECT carts"
	minDuration := 25.5
	maxDuration := 250.5

	stmt, err := BuildLiveTraceCandidatesQuery(contracts.LiveTraceQuery{
		Query:         &queryText,
		OperationName: &operationName,
		SpanName:      &spanName,
		MinDurationMs: &minDuration,
		MaxDurationMs: &maxDuration,
		Attributes: []contracts.AttributeFilter{
			{Key: "http.route", Operator: contracts.AttributeFilterOperatorContains, Value: "/checkout"},
		},
	}, []string{" trace-1 ", "trace-1", "", "trace-2"})
	if err != nil {
		t.Fatalf("BuildLiveTraceCandidatesQuery returned error: %v", err)
	}

	assertContains(t, stmt.SQL, "durationMs >= $minDurationMs")
	assertContains(t, stmt.SQL, "durationMs <= $maxDurationMs")
	assertContains(t, stmt.SQL, "string::lowercase(traceId) CONTAINS $query")
	assertContains(t, stmt.SQL, "traceId IN (SELECT VALUE traceId FROM span WHERE parentSpanId = NONE AND name = $operationName)")
	assertContains(t, stmt.SQL, "traceId IN (SELECT VALUE traceId FROM span WHERE name = $spanName)")
	assertContains(t, stmt.SQL, "string::lowercase(<string> attributes[$attributeKey0]) CONTAINS $attributeValue0")

	traceIDs, ok := stmt.Params["traceIds"].([]string)
	if !ok {
		t.Fatalf("traceIds param = %#v, want []string", stmt.Params["traceIds"])
	}
	assertStringSlice(t, traceIDs, []string{"trace-1", "trace-2"})
	if stmt.Params["query"] != "checkout timeout" {
		t.Fatalf("query param = %#v, want trimmed lowercase search", stmt.Params["query"])
	}
	if stmt.Params["operationName"] != operationName || stmt.Params["spanName"] != spanName {
		t.Fatalf("params = %#v, want operation/span names", stmt.Params)
	}
}

func TestBuildLiveTraceCandidatesQueryRejectsEmptyIDsAndInvalidLimit(t *testing.T) {
	if _, err := BuildLiveTraceCandidatesQuery(contracts.LiveTraceQuery{}, []string{" ", ""}); err == nil {
		t.Fatal("BuildLiveTraceCandidatesQuery accepted empty trace IDs")
	}

	limit := 501
	if _, err := BuildLiveTraceCandidatesQuery(contracts.LiveTraceQuery{Limit: &limit}, []string{"trace-1"}); err == nil {
		t.Fatal("BuildLiveTraceCandidatesQuery accepted limit above 500")
	}
}

func TestBuildTraceByIDAndSpansByTraceIDQueriesTrimIDs(t *testing.T) {
	traceStmt, err := BuildTraceByIDQuery(" trace-123 ")
	if err != nil {
		t.Fatalf("BuildTraceByIDQuery returned error: %v", err)
	}
	assertContains(t, traceStmt.SQL, "FROM type::record('trace', $traceId)")
	assertContains(t, traceStmt.SQL, "WHERE tenantId = $tenantId")
	assertContains(t, traceStmt.SQL, "LIMIT 1")
	assertNoMutation(t, traceStmt.SQL)
	if traceStmt.Params["traceId"] != "trace-123" {
		t.Fatalf("trace params = %#v, want trimmed traceId", traceStmt.Params)
	}

	spansStmt, err := BuildSpansByTraceIDQuery(" trace-123 ")
	if err != nil {
		t.Fatalf("BuildSpansByTraceIDQuery returned error: %v", err)
	}
	assertContains(t, spansStmt.SQL, "FROM span")
	assertContains(t, spansStmt.SQL, "WHERE traceId = $traceId")
	assertContains(t, spansStmt.SQL, "ORDER BY startedAt ASC, spanId ASC")
	assertNoMutation(t, spansStmt.SQL)
	if spansStmt.Params["traceId"] != "trace-123" {
		t.Fatalf("span params = %#v, want trimmed traceId", spansStmt.Params)
	}
}

func TestBuildTraceByIDAndSpansByTraceIDRejectBlankIDs(t *testing.T) {
	if _, err := BuildTraceByIDQuery(" "); err == nil {
		t.Fatal("BuildTraceByIDQuery accepted blank trace ID")
	}
	if _, err := BuildSpansByTraceIDQuery("\t"); err == nil {
		t.Fatal("BuildSpansByTraceIDQuery accepted blank trace ID")
	}
}

func TestAttributeFilterConditionCoversSupportedOperators(t *testing.T) {
	tests := []struct {
		operator contracts.AttributeFilterOperator
		value    any
		wantSQL  string
		wantVal  any
	}{
		{contracts.AttributeFilterOperatorExists, nil, "attributes[$attributeKey0] != NONE", nil},
		{contracts.AttributeFilterOperatorEQ, "prod", "attributes[$attributeKey0] = $attributeValue0", "prod"},
		{contracts.AttributeFilterOperatorNEQ, "dev", "attributes[$attributeKey0] != $attributeValue0", "dev"},
		{contracts.AttributeFilterOperatorContains, "TimeOut", "string::lowercase(<string> attributes[$attributeKey0]) CONTAINS $attributeValue0", "timeout"},
		{contracts.AttributeFilterOperatorGT, 10, "attributes[$attributeKey0] > $attributeValue0", 10},
		{contracts.AttributeFilterOperatorGTE, 10, "attributes[$attributeKey0] >= $attributeValue0", 10},
		{contracts.AttributeFilterOperatorLT, 20, "attributes[$attributeKey0] < $attributeValue0", 20},
		{contracts.AttributeFilterOperatorLTE, 20, "attributes[$attributeKey0] <= $attributeValue0", 20},
		{contracts.AttributeFilterOperatorIN, []string{"prod", "staging"}, "attributes[$attributeKey0] IN $attributeValue0", []string{"prod", "staging"}},
		{contracts.AttributeFilterOperatorNotIN, []string{"dev"}, "attributes[$attributeKey0] NOT IN $attributeValue0", []string{"dev"}},
	}

	for _, test := range tests {
		t.Run(string(test.operator), func(t *testing.T) {
			params := map[string]any{}
			sql, err := attributeFilterCondition(contracts.AttributeFilter{
				Key:      " env ",
				Operator: test.operator,
				Value:    test.value,
			}, 0, params)
			if err != nil {
				t.Fatalf("attributeFilterCondition returned error: %v", err)
			}
			if sql != test.wantSQL {
				t.Fatalf("condition = %q, want %q", sql, test.wantSQL)
			}
			if params["attributeKey0"] != "env" {
				t.Fatalf("params = %#v, want trimmed key", params)
			}
			if test.operator == contracts.AttributeFilterOperatorExists {
				if _, ok := params["attributeValue0"]; ok {
					t.Fatalf("params = %#v, exists must not add value param", params)
				}
				return
			}
			if fmt.Sprint(params["attributeValue0"]) != fmt.Sprint(test.wantVal) {
				t.Fatalf("value param = %#v, want %#v", params["attributeValue0"], test.wantVal)
			}
		})
	}
}

func TestAttributeFilterConditionRejectsBlankKeyAndUnsupportedOperator(t *testing.T) {
	if _, err := attributeFilterCondition(contracts.AttributeFilter{Key: " ", Operator: contracts.AttributeFilterOperatorEQ, Value: "prod"}, 0, map[string]any{}); err == nil {
		t.Fatal("attributeFilterCondition accepted blank key")
	}
	if _, err := attributeFilterCondition(contracts.AttributeFilter{Key: "env", Operator: "regex", Value: "prod"}, 0, map[string]any{}); err == nil {
		t.Fatal("attributeFilterCondition accepted unsupported operator")
	}
}

func TestBuildLogsForTraceDetailQueryUsesEndedAtContextAndDeduplicatesServices(t *testing.T) {
	serviceAPI := "api"
	serviceWorker := "worker"
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(45 * time.Second)
	trace := contracts.Trace{
		ID:          "trace-ended",
		ServiceName: &serviceAPI,
		StartedAt:   startedAt,
		EndedAt:     &endedAt,
		Attributes:  contracts.Attributes{},
	}
	spans := []contracts.Span{
		{ID: "root", TraceID: trace.ID, ServiceName: &serviceAPI, Attributes: contracts.Attributes{}},
		{ID: "child", TraceID: trace.ID, ServiceName: &serviceWorker, Attributes: contracts.Attributes{}},
		{ID: "worker-2", TraceID: trace.ID, ServiceName: &serviceWorker, Attributes: contracts.Attributes{}},
	}

	stmt, err := BuildLogsForTraceDetailQuery(trace, spans)
	if err != nil {
		t.Fatalf("BuildLogsForTraceDetailQuery returned error: %v", err)
	}

	assertStringSlice(t, stmt.Params["spanIds"].([]string), []string{"root", "child", "worker-2"})
	assertStringSlice(t, stmt.Params["services"].([]string), []string{"api", "worker"})
	if stmt.Params["contextFrom"] != startedAt.Add(-5*time.Second) {
		t.Fatalf("contextFrom = %#v, want five seconds before start", stmt.Params["contextFrom"])
	}
	if stmt.Params["contextTo"] != endedAt.Add(5*time.Second) {
		t.Fatalf("contextTo = %#v, want five seconds after end", stmt.Params["contextTo"])
	}
}

func TestDecodeCursorRejectsWrongSortAndInvalidTime(t *testing.T) {
	wrongSort := encodeCursor(t, "timestamp_desc_logEventId_asc", time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC).Format(time.RFC3339Nano), "trace-1")
	if _, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Cursor: &wrongSort}); err == nil {
		t.Fatal("BuildTraceSearchQuery accepted a cursor for a different sort")
	}

	payload := encodeCursor(t, "startedAt_desc_traceId_asc", "not-a-time", "trace-1")
	if _, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Cursor: &payload}); err == nil {
		t.Fatal("BuildTraceSearchQuery accepted cursor with invalid time")
	}

	blankID := strings.TrimRight(encodeCursor(t, "startedAt_desc_traceId_asc", time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC).Format(time.RFC3339Nano), " "), "=")
	if _, err := BuildTraceSearchQuery(contracts.TraceSearchQuery{Cursor: &blankID}); err == nil {
		t.Fatal("BuildTraceSearchQuery accepted cursor with blank last ID")
	}
}
