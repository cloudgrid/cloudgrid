//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

func TestBuildPersistQueryRejectsMissingCommandID(t *testing.T) {
	_, _, err := BuildPersistQuery(contracts.PersistTelemetryCommand{}, "telemetry.ingest.traces", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err == nil {
		t.Fatal("BuildPersistQuery() error = nil")
	}
	if !strings.Contains(err.Error(), "ERR-001") {
		t.Fatalf("error %q does not contain ERR-001", err.Error())
	}
}

func TestBuildPersistQueryUsesParameterizedIdempotentUpserts(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 10, 0, 0, 0, time.FixedZone("CEST", 2*60*60))
	endedAt := startedAt.Add(1500 * time.Millisecond)
	status := contracts.TraceStatusOK
	serviceName := "api"
	authMode := "sso"
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"
	command := contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-1",
			AuthContext: &contracts.AuthContext{
				Mode:      "authenticated",
				AuthMode:  &authMode,
				TenantID:  &tenantID,
				CompanyID: &companyID,
				ProjectID: &projectID,
			},
		},
		CommandID: "cmd-1",
		Source:    "otlp-traces",
		Traces: []contracts.Trace{{
			ID:          "trace-1",
			ServiceName: &serviceName,
			StartedAt:   startedAt,
			EndedAt:     &endedAt,
			Status:      &status,
			Attributes:  contracts.Attributes{"http.method": "GET"},
		}},
		Spans: []contracts.Span{{
			ID:          "span-1",
			TraceID:     "trace-1",
			Name:        "GET /",
			ServiceName: &serviceName,
			StartedAt:   startedAt,
			EndedAt:     endedAt,
			DurationMs:  1.5,
			Status:      &status,
			Attributes:  contracts.Attributes{"route": "/"},
		}},
		Logs: []contracts.LogEvent{{
			ID:          "log-1",
			TraceID:     stringPtr("trace-1"),
			SpanID:      stringPtr("span-1"),
			ServiceName: &serviceName,
			Body:        map[string]any{"message": "hello"},
			Timestamp:   startedAt,
			Attributes:  contracts.Attributes{"level": "info"},
		}},
	}

	completedAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)
	sql, vars, err := BuildPersistQuery(command, "telemetry.ingest.traces", completedAt)
	if err != nil {
		t.Fatalf("BuildPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"BEGIN TRANSACTION",
		"UPSERT type::record('trace', $trace0_id) CONTENT $trace0_record",
		"UPSERT type::record('span', $span0_id) CONTENT $span0_record",
		"UPSERT type::record('log_event', $log0_id) CONTENT $log0_record",
		"UPSERT type::record('service', $service0_id)",
		"CREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record",
		"COMMIT TRANSACTION",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}

	if strings.Contains(sql, "trace-1") || strings.Contains(sql, "span-1") || strings.Contains(sql, "log-1") {
		t.Fatalf("query interpolated record data:\n%s", sql)
	}
	if vars["commandId"] != "cmd-1" {
		t.Fatalf("commandId var = %#v", vars["commandId"])
	}
	ingestRecord := vars["ingest_command_record"].(map[string]any)
	if ingestRecord["commandId"] != "cmd-1" {
		t.Fatalf("ingest command commandId = %#v", ingestRecord["commandId"])
	}
	if ingestRecord["source"] != "otlp-traces" {
		t.Fatalf("ingest command source = %#v", ingestRecord["source"])
	}
	if ingestRecord["requestId"] != "req-1" {
		t.Fatalf("ingest command requestId = %#v", ingestRecord["requestId"])
	}
	if ingestRecord["subject"] != "telemetry.ingest.traces" {
		t.Fatalf("ingest command subject = %#v", ingestRecord["subject"])
	}
	if ingestRecord["traceCount"] != 1 || ingestRecord["spanCount"] != 1 || ingestRecord["logCount"] != 1 {
		t.Fatalf("ingest command counts = %#v", ingestRecord)
	}
	if ingestRecord["completedAt"] != completedAt {
		t.Fatalf("ingest command completedAt = %#v", ingestRecord["completedAt"])
	}
	traceRecord := vars["trace0_record"].(map[string]any)
	if traceRecord["startedAt"] != startedAt.UTC() {
		t.Fatalf("startedAt = %#v", traceRecord["startedAt"])
	}
	if traceRecord["startedAtUnixNano"] != "1778227200000000000" || traceRecord["endedAtUnixNano"] != "1778227201500000000" || traceRecord["durationNano"] != "1500000000" {
		t.Fatalf("trace nanosecond fields = %#v", traceRecord)
	}
	if traceRecord["spanCount"] != 1 {
		t.Fatalf("spanCount = %#v", traceRecord["spanCount"])
	}
	if traceRecord["logCount"] != 1 {
		t.Fatalf("logCount = %#v", traceRecord["logCount"])
	}
	if traceRecord["errorSpanCount"] != 0 {
		t.Fatalf("errorSpanCount = %#v", traceRecord["errorSpanCount"])
	}
	if traceRecord["serviceCount"] != 1 {
		t.Fatalf("serviceCount = %#v", traceRecord["serviceCount"])
	}
	for _, record := range []map[string]any{
		traceRecord,
		vars["span0_record"].(map[string]any),
		vars["log0_record"].(map[string]any),
		vars["service0_record"].(map[string]any),
		ingestRecord,
	} {
		if record["tenantId"] != tenantID || record["companyId"] != companyID || record["projectId"] != projectID {
			t.Fatalf("record missing ownership metadata: %#v", record)
		}
	}
}

func TestBuildPersistQueryCopiesSpanAttributesIntoRecords(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(50 * time.Millisecond)
	serviceName := "assistant-api"
	rootAttrs := contracts.Attributes{"cloudgrid.operation": "POST /api/assistant/runs"}
	childAttrs := contracts.Attributes{"cloudgrid.operation": "conversation.load"}
	command := contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
		CommandID:      "cmd-1",
		Source:         "otlp-traces",
		Spans: []contracts.Span{
			{
				ID:          "span-root",
				TraceID:     "trace-1",
				Name:        "POST /api/assistant/runs",
				ServiceName: &serviceName,
				StartedAt:   startedAt,
				EndedAt:     endedAt,
				DurationMs:  50,
				Attributes:  rootAttrs,
			},
			{
				ID:           "span-child",
				TraceID:      "trace-1",
				ParentSpanID: stringPtr("span-root"),
				Name:         "load conversation",
				ServiceName:  &serviceName,
				StartedAt:    startedAt.Add(5 * time.Millisecond),
				EndedAt:      endedAt,
				DurationMs:   45,
				Attributes:   childAttrs,
			},
		},
	}

	_, vars, err := BuildPersistQuery(command, "telemetry.ingest.traces", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildPersistQuery() error = %v", err)
	}

	rootAttrs["cloudgrid.operation"] = "mutated-after-build"
	childAttrs["cloudgrid.operation"] = "mutated-after-build"

	span0Attrs := vars["span0_record"].(map[string]any)["attributes"].(contracts.Attributes)
	if span0Attrs["cloudgrid.operation"] != "POST /api/assistant/runs" {
		t.Fatalf("span0 attributes = %#v", span0Attrs)
	}
	span1Attrs := vars["span1_record"].(map[string]any)["attributes"].(contracts.Attributes)
	if span1Attrs["cloudgrid.operation"] != "conversation.load" {
		t.Fatalf("span1 attributes = %#v", span1Attrs)
	}
	serviceAttrs := vars["service0_record"].(map[string]any)["attributes"].(contracts.Attributes)
	if serviceAttrs["cloudgrid.operation"] != "conversation.load" {
		t.Fatalf("service attributes should merge latest service metadata without mutating spans: %#v", serviceAttrs)
	}
}

func TestBuildPersistQueryRecordsIngestCommandAfterTelemetry(t *testing.T) {
	command := contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
		CommandID:      "cmd-1",
		Source:         "otlp-traces",
		Traces: []contracts.Trace{{
			ID:         "trace-1",
			StartedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			Attributes: contracts.Attributes{},
		}},
	}

	sql, _, err := BuildPersistQuery(command, "telemetry.ingest.traces", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildPersistQuery() error = %v", err)
	}

	traceIndex := strings.Index(sql, "UPSERT type::record('trace', $trace0_id) CONTENT $trace0_record")
	ingestIndex := strings.Index(sql, "CREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record")
	if traceIndex == -1 || ingestIndex == -1 || ingestIndex < traceIndex {
		t.Fatalf("ingest command must be recorded after telemetry writes:\n%s", sql)
	}
}

func TestBuildPersistQueryMapsSpanLinksAndOmitsDerivedUIFields(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Millisecond)
	traceState := "vendor=value"
	direction := contracts.SpanLinkDirectionForward
	status := contracts.TraceStatusError
	command := contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
		CommandID:      "cmd-1",
		Source:         "otlp-traces",
		Spans: []contracts.Span{{
			ID:             "span-1",
			TraceID:        "trace-1",
			Name:           "GET /linked",
			StartedAt:      startedAt,
			EndedAt:        endedAt,
			DurationMs:     1,
			Status:         &status,
			Attributes:     contracts.Attributes{},
			Depth:          9,
			ChildCount:     2,
			HasError:       true,
			IsCriticalPath: true,
			IsOrphan:       true,
			IsServiceEntry: true,
			ExceptionCount: 4,
			Exceptions: []contracts.SpanException{{
				Timestamp:  startedAt,
				Attributes: contracts.Attributes{"exception.type": "panic"},
			}},
			Links: []contracts.SpanLink{{
				TraceID:    "linked-trace",
				SpanID:     "linked-span",
				TraceState: &traceState,
				Attributes: contracts.Attributes{"link.kind": "follows_from"},
				Direction:  &direction,
			}},
		}},
	}

	_, vars, err := BuildPersistQuery(command, "telemetry.ingest.traces", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildPersistQuery() error = %v", err)
	}

	spanRecord := vars["span0_record"].(map[string]any)
	links := spanRecord["links"].([]map[string]any)
	if len(links) != 1 {
		t.Fatalf("links = %#v, want one link", links)
	}
	if links[0]["traceId"] != "linked-trace" || links[0]["spanId"] != "linked-span" || links[0]["traceState"] != "vendor=value" {
		t.Fatalf("link record = %#v", links[0])
	}
	attrs := links[0]["attributes"].(contracts.Attributes)
	if attrs["link.kind"] != "follows_from" {
		t.Fatalf("link attributes = %#v", attrs)
	}
	for _, forbidden := range []string{"direction", "depth", "childCount", "hasError", "isCriticalPath", "isOrphan", "isServiceEntry", "exceptionCount", "exceptions"} {
		if _, ok := spanRecord[forbidden]; ok {
			t.Fatalf("span record persisted derived field %q: %#v", forbidden, spanRecord)
		}
		if _, ok := links[0][forbidden]; ok {
			t.Fatalf("link record persisted derived field %q: %#v", forbidden, links[0])
		}
	}
}

func TestBuildPersistQueryRejectsInvalidSpanLinks(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Millisecond)

	tests := []struct {
		name string
		link contracts.SpanLink
		want string
	}{
		{
			name: "missing trace id",
			link: contracts.SpanLink{SpanID: "span-2"},
			want: "span link traceId is required",
		},
		{
			name: "missing span id",
			link: contracts.SpanLink{TraceID: "trace-2"},
			want: "span link spanId is required",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			command := contracts.PersistTelemetryCommand{
				BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
				CommandID:      "cmd-1",
				Source:         "otlp-traces",
				Spans: []contracts.Span{{
					ID:        "span-1",
					TraceID:   "trace-1",
					Name:      "GET /linked",
					StartedAt: startedAt,
					EndedAt:   endedAt,
					Links:     []contracts.SpanLink{test.link},
				}},
			}

			_, _, err := BuildPersistQuery(command, "telemetry.ingest.traces", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
			if err == nil {
				t.Fatal("BuildPersistQuery() error = nil")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("BuildPersistQuery() error = %q, want %q", err.Error(), test.want)
			}
		})
	}
}

func TestBuildPersistQueryRejectsMissingCommandMetadata(t *testing.T) {
	valid := validPersistCommand()
	completedAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)

	tests := []struct {
		name    string
		mutate  func(*contracts.PersistTelemetryCommand)
		subject string
		doneAt  time.Time
		want    string
	}{
		{name: "missing source", mutate: func(command *contracts.PersistTelemetryCommand) { command.Source = " " }, subject: "telemetry.ingest.traces", doneAt: completedAt, want: "source is required"},
		{name: "invalid source", mutate: func(command *contracts.PersistTelemetryCommand) { command.Source = "custom" }, subject: "telemetry.ingest.traces", doneAt: completedAt, want: "source is invalid"},
		{name: "missing subject", mutate: func(*contracts.PersistTelemetryCommand) {}, subject: " ", doneAt: completedAt, want: "subject is required"},
		{name: "missing request id", mutate: func(command *contracts.PersistTelemetryCommand) { command.RequestID = " " }, subject: "telemetry.ingest.traces", doneAt: completedAt, want: "requestId is required"},
		{name: "missing completed at", mutate: func(*contracts.PersistTelemetryCommand) {}, subject: "telemetry.ingest.traces", doneAt: time.Time{}, want: "completedAt is required"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			command := valid
			test.mutate(&command)
			_, _, err := BuildPersistQuery(command, test.subject, test.doneAt)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("BuildPersistQuery() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestBuildPersistQueryRejectsInvalidTelemetryRecords(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Millisecond)
	completedAt := startedAt.Add(2 * time.Second)
	validSpan := contracts.Span{
		ID:         "span-1",
		TraceID:    "trace-1",
		Name:       "GET /",
		StartedAt:  startedAt,
		EndedAt:    endedAt,
		DurationMs: 1,
		Attributes: contracts.Attributes{},
	}
	validLog := contracts.LogEvent{
		ID:         "log-1",
		Body:       "hello",
		Timestamp:  startedAt,
		Attributes: contracts.Attributes{},
	}

	tests := []struct {
		name   string
		mutate func(*contracts.PersistTelemetryCommand)
		want   string
	}{
		{name: "missing trace id", mutate: func(command *contracts.PersistTelemetryCommand) {
			command.Traces = []contracts.Trace{{StartedAt: startedAt, Attributes: contracts.Attributes{}}}
		}, want: "trace id is required"},
		{name: "missing trace startedAt", mutate: func(command *contracts.PersistTelemetryCommand) {
			command.Traces = []contracts.Trace{{ID: "trace-1", Attributes: contracts.Attributes{}}}
		}, want: "trace startedAt is required"},
		{name: "missing span id", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.ID = " "
			command.Spans = []contracts.Span{span}
		}, want: "span id is required"},
		{name: "missing span trace id", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.TraceID = " "
			command.Spans = []contracts.Span{span}
		}, want: "span traceId is required"},
		{name: "missing span name", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.Name = " "
			command.Spans = []contracts.Span{span}
		}, want: "span name is required"},
		{name: "missing span startedAt", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.StartedAt = time.Time{}
			command.Spans = []contracts.Span{span}
		}, want: "span startedAt is required"},
		{name: "missing span endedAt", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.EndedAt = time.Time{}
			command.Spans = []contracts.Span{span}
		}, want: "span endedAt is required"},
		{name: "missing span event name", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.Events = []contracts.SpanEvent{{Timestamp: startedAt}}
			command.Spans = []contracts.Span{span}
		}, want: "span event name is required"},
		{name: "missing span event timestamp", mutate: func(command *contracts.PersistTelemetryCommand) {
			span := validSpan
			span.Events = []contracts.SpanEvent{{Name: "event"}}
			command.Spans = []contracts.Span{span}
		}, want: "span event timestamp is required"},
		{name: "missing log id", mutate: func(command *contracts.PersistTelemetryCommand) {
			log := validLog
			log.ID = " "
			command.Logs = []contracts.LogEvent{log}
		}, want: "log event id is required"},
		{name: "missing log body", mutate: func(command *contracts.PersistTelemetryCommand) {
			log := validLog
			log.Body = nil
			command.Logs = []contracts.LogEvent{log}
		}, want: "log body is required"},
		{name: "missing log timestamp", mutate: func(command *contracts.PersistTelemetryCommand) {
			log := validLog
			log.Timestamp = time.Time{}
			command.Logs = []contracts.LogEvent{log}
		}, want: "log timestamp is required"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			command := validPersistCommand()
			test.mutate(&command)
			_, _, err := BuildPersistQuery(command, "telemetry.ingest.traces", completedAt)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("BuildPersistQuery() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestRecordHelpersIncludeOptionalFieldsAndDefaults(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Second)
	duration := 1000.0
	service := "api"
	rootSpan := "root"
	status := contracts.TraceStatusError

	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		t.Fatalf("ResolveTelemetryTarget returned error: %v", err)
	}
	trace := traceRecord(contracts.Trace{
		ID:          "trace-1",
		ServiceName: &service,
		StartedAt:   startedAt,
		EndedAt:     &endedAt,
		DurationMs:  &duration,
		RootSpanID:  &rootSpan,
		Status:      &status,
	}, "GET /checkout", []string{"SELECT carts"}, []contracts.Attributes{{"db.system": "postgresql"}}, 2, 1, 3, 4, target)
	for _, key := range []string{"serviceName", "operationName", "endedAt", "durationMs", "rootSpanId", "status", "searchText"} {
		if _, ok := trace[key]; !ok {
			t.Fatalf("trace record missing %q: %#v", key, trace)
		}
	}
	traceSearch, ok := trace["searchText"].(string)
	if !ok || !strings.Contains(traceSearch, "SELECT carts") || !strings.Contains(traceSearch, "postgresql") {
		t.Fatalf("trace searchText = %#v, want span names and attributes", trace["searchText"])
	}

	records := map[string]serviceRecord{}
	mergeService(records, "   ", startedAt, contracts.Attributes{"ignored": true})
	if len(records) != 0 {
		t.Fatalf("blank service should be ignored: %#v", records)
	}
	mergeService(records, "API", endedAt, nil)
	mergeService(records, "API", startedAt, contracts.Attributes{"env": "prod"})
	if records["API"].FirstSeenAt != startedAt || records["API"].LastSeenAt != endedAt {
		t.Fatalf("service record time range = %#v", records["API"])
	}
	if records["API"].Attributes["env"] != "prod" {
		t.Fatalf("service attributes = %#v", records["API"].Attributes)
	}
	if slugServiceName(" !!! ") != "unknown" {
		t.Fatalf("blank slug should fall back to unknown")
	}
	if len(spanEvents(nil)) != 0 || len(spanLinks(nil)) != 0 {
		t.Fatalf("empty span event/link helpers should return empty slices")
	}
}

func TestBuildPersistQueryBuildsOptionalLogAndServiceFields(t *testing.T) {
	startedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	observedAt := startedAt.Add(time.Second)
	serviceA := " Checkout API "
	serviceB := "Checkout API"
	severity := 9
	command := contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
		CommandID:      "cmd-1",
		Source:         "otlp-logs",
		Logs: []contracts.LogEvent{
			{
				ID:                "log-1",
				TraceID:           stringPtr("trace-1"),
				SpanID:            stringPtr("span-1"),
				ServiceName:       &serviceA,
				SeverityText:      stringPtr("WARN"),
				SeverityNumber:    &severity,
				Body:              "plain body",
				Timestamp:         startedAt.Add(2 * time.Second),
				ObservedTimestamp: &observedAt,
				Attributes:        contracts.Attributes{"env": "prod"},
			},
			{
				ID:          "log-2",
				ServiceName: &serviceB,
				Body:        map[string]any{"message": "structured"},
				Timestamp:   startedAt,
				Attributes:  contracts.Attributes{"region": "local"},
			},
		},
	}

	sql, vars, err := BuildPersistQuery(command, "telemetry.ingest.logs", time.Date(2026, 5, 8, 8, 0, 3, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildPersistQuery() error = %v", err)
	}

	if !strings.Contains(sql, "UPDATE type::record('trace', $traceLog0_id) SET logCount = (SELECT count() AS count FROM log_event") {
		t.Fatalf("log ingest should refresh denormalized trace log counts:\n%s", sql)
	}
	if vars["traceLog0_id"] != "trace-1" {
		t.Fatalf("trace log count refresh id = %#v", vars["traceLog0_id"])
	}
	logRecord := vars["log0_record"].(map[string]any)
	if logRecord["bodyText"] != "plain body" || logRecord["observedTimestamp"] != observedAt.UTC() {
		t.Fatalf("log record optional fields = %#v", logRecord)
	}
	if searchText, ok := logRecord["searchText"].(string); !ok || !strings.Contains(searchText, "plain body") || !strings.Contains(searchText, "WARN") {
		t.Fatalf("log searchText = %#v, want body and severity", logRecord["searchText"])
	}
	if logRecord["severityText"] != "WARN" || logRecord["severityNumber"] != severity {
		t.Fatalf("log severity fields = %#v", logRecord)
	}
	if _, ok := vars["log1_record"].(map[string]any)["bodyText"]; ok {
		t.Fatalf("structured log body should not set bodyText: %#v", vars["log1_record"])
	}
	if vars["service0_id"] != "checkout-api" {
		t.Fatalf("service0_id = %#v, want slugged checkout-api", vars["service0_id"])
	}
	serviceRecord := vars["service0_record"].(map[string]any)
	if serviceRecord["firstSeenAt"] != startedAt.UTC() || serviceRecord["lastSeenAt"] != startedAt.Add(2*time.Second).UTC() {
		t.Fatalf("service first/last seen = %#v", serviceRecord)
	}
	attrs := serviceRecord["attributes"].(contracts.Attributes)
	if attrs["env"] != "prod" || attrs["region"] != "local" {
		t.Fatalf("merged service attributes = %#v", attrs)
	}
}

func TestPersisterRejectsUnconfiguredStorageAndBlankCommandID(t *testing.T) {
	p := Persister{}

	if _, err := p.CommandExists(context.Background(), contracts.PersistTelemetryCommand{CommandID: "cmd-1"}); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("CommandExists() error = %v, want ERR-006", err)
	}
	if err := p.Persist(context.Background(), contracts.PersistTelemetryCommand{}, "telemetry.ingest.traces", time.Now()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("Persist() error = %v, want ERR-006", err)
	}

	p = Persister{DB: &fakeDB{}}
	if _, err := p.CommandExists(context.Background(), contracts.PersistTelemetryCommand{CommandID: " "}); err == nil || !strings.Contains(err.Error(), "commandId is required") {
		t.Fatalf("CommandExists(blank) error = %v, want validation", err)
	}
}

func TestPersisterChecksIngestCommandDuplicateBeforeWriting(t *testing.T) {
	db := &fakeDB{commandExists: true}
	p := Persister{DB: db}

	exists, err := p.CommandExists(context.Background(), contracts.PersistTelemetryCommand{CommandID: "cmd-1"})
	if err != nil {
		t.Fatalf("CommandExists() error = %v", err)
	}

	if !exists {
		t.Fatal("CommandExists() = false, want true")
	}
	if db.sql != "" {
		t.Fatalf("duplicate check wrote SQL through Query: %s", db.sql)
	}
}

func TestPersisterRecordsDBAdapterTraceSpanFromParentContext(t *testing.T) {
	db := &fakeDB{}
	recorder := &traceRecorder{}
	p := Persister{DB: db}
	p.EnableDBAdapterTracing(recorder)
	parent := selfobs.TraceContext{TraceID: "4bf92f3577b34da6a3ce929d0e0e4736", SpanID: "00f067aa0ba902b7"}
	ctx := selfobs.ContextWithTraceContext(context.Background(), parent)

	err := p.Persist(ctx, validPersistCommand(), "telemetry.ingest.traces", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Persist returned error: %v", err)
	}
	if len(recorder.spans) != 1 {
		t.Fatalf("spans = %#v, want one adapter span", recorder.spans)
	}
	span := recorder.spans[0]
	if span.Name != "storage-write.db.persist_ingest" || span.ParentSpanID != parent.SpanID {
		t.Fatalf("span = %#v, want persist_ingest child of parent", span)
	}
	if span.Attributes["cloudgrid.db.operation"] != "persist_ingest" || span.Attributes["cloudgrid.db.target_kind"] != "telemetry" {
		t.Fatalf("span attributes = %#v", span.Attributes)
	}
}

func TestPersisterRunsIdempotentCanonicalIDUpserts(t *testing.T) {
	db := &fakeDB{}
	p := Persister{DB: db}

	err := p.Persist(context.Background(), contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
		CommandID:      "cmd-1",
		Source:         "otlp-traces",
		Traces: []contracts.Trace{{
			ID:         "trace-1",
			StartedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			Attributes: contracts.Attributes{},
		}},
	}, "telemetry.ingest.traces", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("Persist() error = %v", err)
	}

	if !strings.Contains(db.sql, "UPSERT type::record('trace', $trace0_id) CONTENT $trace0_record") {
		t.Fatalf("query does not upsert trace by canonical id:\n%s", db.sql)
	}
	if db.vars["commandId"] != "cmd-1" {
		t.Fatalf("commandId var = %#v", db.vars["commandId"])
	}
}

func TestBuildMetricsPersistQueryAppliesMetricPolicyAndRecordsCommand(t *testing.T) {
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"
	command := contracts.PersistMetricsCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-metrics-1",
			IssuedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			AuthContext: &contracts.AuthContext{
				TenantID:  &tenantID,
				CompanyID: &companyID,
				ProjectID: &projectID,
			},
		},
		CommandID: "cmd-metrics-1",
		Source:    "otlp-metrics",
		Descriptors: []contracts.MetricDescriptor{{
			ID:          "orders-created",
			Name:        "orders.created",
			Kind:        contracts.MetricKindSum,
			Unit:        "1",
			FirstSeenAt: time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			LastSeenAt:  time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
		}},
		Points: []contracts.MetricPoint{{
			ID:          "orders-created-point",
			MetricName:  "orders.created",
			ServiceName: stringPtr("api"),
			Kind:        contracts.MetricKindSum,
			Timestamp:   time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
			Value:       floatPtr(7),
			Attributes: contracts.Attributes{
				"tenantId":      "spoof",
				"project_id":    "spoof",
				"authorization": "secret",
				"route":         "/orders",
			},
			Exemplars: metricExemplars(18),
		}},
	}

	sql, vars, err := BuildMetricsPersistQuery(command, "telemetry.ingest.metrics", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildMetricsPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"BEGIN TRANSACTION",
		"UPSERT type::record('metric_descriptor', $descriptor0_id) SET",
		"attributeKeys = array::sort(array::distinct(array::concat(IF attributeKeys = NONE THEN [] ELSE attributeKeys END, $descriptor0_attribute_keys)))",
		"firstSeenAt = IF firstSeenAt = NONE OR $descriptor0_record.firstSeenAt < firstSeenAt THEN $descriptor0_record.firstSeenAt ELSE firstSeenAt END",
		"lastSeenAt = IF lastSeenAt = NONE OR $descriptor0_record.lastSeenAt > lastSeenAt THEN $descriptor0_record.lastSeenAt ELSE lastSeenAt END",
		"UPSERT type::record('metric_point', $point0_id) CONTENT $point0_record",
		"UPSERT type::record('metric_ingest_cardinality', $cardinality0_id) MERGE $cardinality0_record",
		"CREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record",
		"COMMIT TRANSACTION",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}
	pointRecord := vars["point0_record"].(map[string]any)
	attrs := pointRecord["attributes"].(contracts.Attributes)
	for _, reserved := range []string{"tenantId", "project_id", "authorization"} {
		if _, ok := attrs[reserved]; ok {
			t.Fatalf("reserved attribute %q was persisted: %#v", reserved, attrs)
		}
	}
	if attrs["route"] != "/orders" {
		t.Fatalf("attributes = %#v", attrs)
	}
	if pointRecord["droppedAttributeCount"] != 3 {
		t.Fatalf("droppedAttributeCount = %#v, want 3", pointRecord["droppedAttributeCount"])
	}
	if !reflect.DeepEqual(vars["descriptor0_attribute_keys"], []string{"route"}) {
		t.Fatalf("descriptor attribute keys = %#v, want [route]", vars["descriptor0_attribute_keys"])
	}
	if len(pointRecord["exemplars"].([]map[string]any)) != 16 {
		t.Fatalf("exemplar count = %d, want capped 16", len(pointRecord["exemplars"].([]map[string]any)))
	}
	emptyPoint := metricPointRecord(contracts.MetricPoint{
		MetricName: "orders.empty",
		Kind:       contracts.MetricKindGauge,
		Timestamp:  time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
	}, TelemetryTarget{TenantID: tenantID, CompanyID: companyID, ProjectID: projectID})
	if emptyPoint["bucketCounts"] == nil || emptyPoint["explicitBounds"] == nil || emptyPoint["quantileValues"] == nil || emptyPoint["exemplars"] == nil {
		t.Fatalf("metric array fields must persist as empty arrays, got %#v", emptyPoint)
	}
	ingestRecord := vars["ingest_command_record"].(map[string]any)
	if ingestRecord["source"] != "otlp-metrics" || ingestRecord["metricPointCount"] != 1 {
		t.Fatalf("ingest command = %#v", ingestRecord)
	}
	for _, record := range []map[string]any{
		vars["descriptor0_record"].(map[string]any),
		pointRecord,
		vars["cardinality0_record"].(map[string]any),
		ingestRecord,
	} {
		if record["tenantId"] != tenantID || record["companyId"] != companyID || record["projectId"] != projectID {
			t.Fatalf("record missing ownership metadata: %#v", record)
		}
	}
}

func TestBuildMetricsPersistQueryDropsMetricAttributesBeyondDistinctValueBudget(t *testing.T) {
	command := validMetricsPersistCommand()
	command.Points = make([]contracts.MetricPoint, 0, maxMetricDistinctValuesPerAttribute+1)
	for i := 0; i <= maxMetricDistinctValuesPerAttribute; i++ {
		point := validMetricsPersistCommand().Points[0]
		point.ID = fmt.Sprintf("orders-created-point-%d", i)
		point.Timestamp = point.Timestamp.Add(time.Duration(i) * time.Second)
		point.Attributes = contracts.Attributes{"user.id": fmt.Sprintf("user-%d", i)}
		command.Points = append(command.Points, point)
	}

	_, vars, err := BuildMetricsPersistQuery(command, "telemetry.ingest.metrics", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildMetricsPersistQuery() error = %v", err)
	}

	firstPoint := vars["point999_record"].(map[string]any)
	if attrs := firstPoint["attributes"].(contracts.Attributes); attrs["user.id"] != "user-999" {
		t.Fatalf("point999 attributes = %#v, want retained user.id", attrs)
	}
	overflowPoint := vars["point1000_record"].(map[string]any)
	if attrs := overflowPoint["attributes"].(contracts.Attributes); len(attrs) != 0 {
		t.Fatalf("overflow point attributes = %#v, want user.id dropped", attrs)
	}
	if overflowPoint["droppedAttributeCount"] != 1 {
		t.Fatalf("overflow droppedAttributeCount = %#v, want 1", overflowPoint["droppedAttributeCount"])
	}
	cardinality := vars["cardinality0_record"].(map[string]any)
	valueCounts := cardinality["valueCounts"].(map[string]int)
	if len(valueCounts) != maxMetricDistinctValuesPerAttribute {
		t.Fatalf("valueCounts length = %d, want %d", len(valueCounts), maxMetricDistinctValuesPerAttribute)
	}
}

func TestBuildMetricsPersistQueryRejectsInvalidMetricCommands(t *testing.T) {
	command := validMetricsPersistCommand()
	completedAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)

	tests := []struct {
		name   string
		mutate func(*contracts.PersistMetricsCommand)
		want   string
	}{
		{name: "invalid source", mutate: func(command *contracts.PersistMetricsCommand) { command.Source = "otlp-traces" }, want: "source is invalid"},
		{name: "descriptor missing name", mutate: func(command *contracts.PersistMetricsCommand) { command.Descriptors[0].Name = " " }, want: "metric descriptor name is required"},
		{name: "point missing metric name", mutate: func(command *contracts.PersistMetricsCommand) { command.Points[0].MetricName = " " }, want: "metric point metricName is required"},
		{name: "point missing timestamp", mutate: func(command *contracts.PersistMetricsCommand) { command.Points[0].Timestamp = time.Time{} }, want: "metric point timestamp is required"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			mutated := command
			mutated.Descriptors = append([]contracts.MetricDescriptor(nil), command.Descriptors...)
			mutated.Points = append([]contracts.MetricPoint(nil), command.Points...)
			test.mutate(&mutated)
			_, _, err := BuildMetricsPersistQuery(mutated, "telemetry.ingest.metrics", completedAt)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("BuildMetricsPersistQuery() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestMetricsPersisterChecksDuplicatesAndWritesMetrics(t *testing.T) {
	db := &fakeDB{}
	p := Persister{DB: db}
	command := validMetricsPersistCommand()

	exists, err := p.MetricsCommandExists(context.Background(), command)
	if err != nil {
		t.Fatalf("MetricsCommandExists() error = %v", err)
	}
	if exists {
		t.Fatal("MetricsCommandExists() = true, want false")
	}
	if err := p.PersistMetrics(context.Background(), command, "telemetry.ingest.metrics", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)); err != nil {
		t.Fatalf("PersistMetrics() error = %v", err)
	}
	if !strings.Contains(db.sql, "metric_descriptor") || !strings.Contains(db.sql, "metric_point") {
		t.Fatalf("query = %s, want metric writes", db.sql)
	}
}

func TestBuildAIProjectionPersistQueryUsesCanonicalProjectionTable(t *testing.T) {
	command := validAIProjectionPersistCommand()
	completedAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)

	sql, vars, projectionIDs, err := BuildAIProjectionPersistQuery(command, "telemetry.ingest.ai_projections", completedAt)
	if err != nil {
		t.Fatalf("BuildAIProjectionPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"BEGIN TRANSACTION",
		"UPSERT type::record('ai_agent_run', $projection_id) CONTENT $projection_record",
		"CREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record",
		"COMMIT TRANSACTION",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}
	if strings.Contains(sql, "agent-run-1") || strings.Contains(sql, "trace-1") {
		t.Fatalf("query interpolated record data:\n%s", sql)
	}
	if vars["projection_id"] != "agent-run-1" {
		t.Fatalf("projection_id = %#v", vars["projection_id"])
	}
	if strings.Join(projectionIDs, ",") != "agent-run-1" {
		t.Fatalf("projectionIDs = %#v", projectionIDs)
	}
	record := vars["projection_record"].(map[string]any)
	if record["traceId"] != "trace-1" || record["spanId"] != "span-1" || record["rootSpanId"] != "span-1" {
		t.Fatalf("projection record = %#v", record)
	}
	if _, ok := record["id"]; ok {
		t.Fatalf("projection record persisted GraphQL id inside SurrealDB content: %#v", record)
	}
	if record["tenantId"] != "tenant_1" || record["projectId"] != "project_1" {
		t.Fatalf("projection record missing ownership: %#v", record)
	}
	ingestRecord := vars["ingest_command_record"].(map[string]any)
	if ingestRecord["source"] != "ai-projection" || ingestRecord["traceCount"] != 1 || ingestRecord["spanCount"] != 1 {
		t.Fatalf("ingest command record = %#v", ingestRecord)
	}
}

func TestBuildAIProjectionPersistQueryRejectsUnsupportedKind(t *testing.T) {
	command := validAIProjectionPersistCommand()
	command.Kind = "prompt"

	_, _, _, err := BuildAIProjectionPersistQuery(command, "telemetry.ingest.ai_projections", time.Now())
	if err == nil || !strings.Contains(err.Error(), "kind is invalid") {
		t.Fatalf("BuildAIProjectionPersistQuery() error = %v, want invalid kind", err)
	}
}

func TestBuildEvalMutationPersistQueryUsesSubjectTable(t *testing.T) {
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-dataset-1", IssuedAt: time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)},
		Input: map[string]any{
			"name": "golden answers",
			"tags": []any{"smoke"},
		},
	}
	occurredAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.dataset.create", request, occurredAt)
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"BEGIN TRANSACTION",
		"UPSERT type::record('ai_dataset', $record_id) CONTENT $record",
		"COMMIT TRANSACTION",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}
	if strings.Contains(sql, "golden answers") {
		t.Fatalf("query interpolated record data:\n%s", sql)
	}
	if vars["record_id"] == "" {
		t.Fatalf("record_id = %#v", vars["record_id"])
	}
	record := vars["record"].(map[string]any)
	if record["name"] != "golden answers" || record["version"] != 1 || record["itemCount"] != 0 {
		t.Fatalf("record = %#v", record)
	}
	if _, ok := record["id"]; ok {
		t.Fatalf("record persisted GraphQL id inside SurrealDB content: %#v", record)
	}
	if data["id"] != vars["record_id"] {
		t.Fatalf("data = %#v record_id = %#v", data, vars["record_id"])
	}
}

func TestBuildEvalMutationPersistQuerySupportsDatasetAppendPromoteAndPromptPromotion(t *testing.T) {
	occurredAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)
	tests := []struct {
		name      string
		subject   string
		input     map[string]any
		wantTable string
		wantID    string
	}{
		{
			name:    "append dataset items",
			subject: "eval.dataset.items.append",
			input: map[string]any{
				"datasetId": "dataset-1",
				"version":   2.0,
				"items": []any{map[string]any{
					"id":       "item-1",
					"input":    map[string]any{"question": "2+2"},
					"expected": map[string]any{"answer": "4"},
					"metadata": map[string]any{"source": "manual"},
					"split":    "validation",
				}},
			},
			wantTable: "ai_dataset_item",
			wantID:    "item-1",
		},
		{
			name:    "promote dataset item",
			subject: "eval.dataset.item.promote",
			input: map[string]any{
				"datasetId":     "dataset-1",
				"sourceTraceId": "trace-1",
				"sourceSpanId":  "span-1",
				"split":         "regression",
				"metadata":      map[string]any{"reviewed": true},
			},
			wantTable: "ai_dataset_item",
		},
		{
			name:    "promote prompt version",
			subject: "eval.prompt_version.promote",
			input: map[string]any{
				"promptVersionId": "prompt-1",
				"tag":             "production",
				"notes":           "reviewed candidate",
			},
			wantTable: "ai_prompt_version",
			wantID:    "prompt-1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := contracts.EvalMutationRequest{
				BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-" + tt.name, IssuedAt: time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)},
				Input:          tt.input,
			}

			sql, vars, data, err := BuildEvalMutationPersistQuery(tt.subject, request, occurredAt)
			if err != nil {
				t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
			}
			if !strings.Contains(sql, "UPSERT type::record('"+tt.wantTable+"'") {
				t.Fatalf("query = %s, want table %s", sql, tt.wantTable)
			}
			if tt.subject == "eval.dataset.items.append" {
				for _, want := range []string{
					"UPDATE type::record('ai_dataset', $dataset_id)",
					"itemCount = (SELECT count() AS count FROM ai_dataset_item",
					"datasetId = $dataset_id",
				} {
					if !strings.Contains(sql, want) {
						t.Fatalf("query = %s, missing %q", sql, want)
					}
				}
				if vars["dataset_id"] != "dataset-1" || vars["dataset_version"] != 2 {
					t.Fatalf("dataset vars = %#v", vars)
				}
			}
			record := vars["record"].(map[string]any)
			if _, ok := record["id"]; ok {
				t.Fatalf("record persisted GraphQL id inside SurrealDB content: %#v", record)
			}
			if tt.wantID != "" && vars["record_id"] != tt.wantID {
				t.Fatalf("record id = %#v, want %q", vars["record_id"], tt.wantID)
			}
			if data["id"] != vars["record_id"] {
				t.Fatalf("data = %#v record_id = %#v", data, vars["record_id"])
			}
		})
	}
}

func TestBuildEvalMutationPersistQuerySupportsOnlineEvalResultWithoutExperimentRun(t *testing.T) {
	occurredAt := time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-online-result-1", IssuedAt: time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)},
		Input: map[string]any{
			"results": []any{map[string]any{
				"id":            "result-online-1",
				"scorerId":      "scorer-1",
				"scorerVersion": 1.0,
				"targetKind":    "agentRun",
				"targetId":      "agent-run-1",
				"score":         1.0,
				"passed":        true,
				"producedAt":    occurredAt.Format(time.RFC3339),
				"evidence":      map[string]any{"online": true, "policyId": "policy-1"},
			}},
		},
	}

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.results.persist", request, occurredAt)
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}
	if !strings.Contains(sql, "UPSERT type::record('ai_eval_result'") {
		t.Fatalf("query = %s, want ai_eval_result table", sql)
	}
	record := vars["record"].(map[string]any)
	if _, ok := record["id"]; ok {
		t.Fatalf("record persisted GraphQL id inside SurrealDB content: %#v", record)
	}
	if vars["record_id"] != "result-online-1" || record["targetKind"] != "agentRun" {
		t.Fatalf("record = %#v, want online eval result without experimentRunId", record)
	}
	if _, ok := record["experimentRunId"]; ok {
		t.Fatalf("record = %#v, want omitted experimentRunId for online result", record)
	}
	if data["id"] != "result-online-1" {
		t.Fatalf("data = %#v, want online eval result data", data)
	}
}

func TestBuildEvalMutationPersistQueryPersistsDatasetItemRunRecords(t *testing.T) {
	occurredAt := time.Date(2026, 5, 17, 10, 0, 0, 0, time.UTC)
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-item-run-1", IssuedAt: occurredAt},
		Input: map[string]any{
			"experimentRunId": "run-1",
			"itemRuns": []any{map[string]any{
				"id":            "item-run-1",
				"datasetItemId": "item-1",
				"harnessRunId":  "harness-run-1",
				"output":        map[string]any{"answer": "ok"},
				"latencyMs":     12,
			}},
		},
	}

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.results.persist", request, occurredAt)
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}
	if !strings.Contains(sql, "UPSERT type::record('ai_dataset_item_run'") {
		t.Fatalf("query = %s, want ai_dataset_item_run table", sql)
	}
	record := vars["record"].(map[string]any)
	if vars["record_id"] != "item-run-1" || record["experimentRunId"] != "run-1" || record["datasetItemId"] != "item-1" || record["latencyMs"] != 12 {
		t.Fatalf("record = %#v record_id = %#v, want dataset item run", record, vars["record_id"])
	}
	if _, ok := record["itemRuns"]; ok {
		t.Fatalf("record = %#v, want flattened dataset item run", record)
	}
	if data["id"] != "item-run-1" {
		t.Fatalf("data = %#v, want item run response data", data)
	}
}

func TestBuildEvalMutationPersistQuerySupportsExperimentRunResult(t *testing.T) {
	occurredAt := time.Date(2026, 5, 17, 10, 0, 0, 0, time.UTC)
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-run-1", IssuedAt: occurredAt},
		Input: map[string]any{
			"experimentRunId": "run-1",
			"results": []any{map[string]any{
				"id":           "run-1",
				"experimentId": "experiment-1",
				"solverRef":    map[string]any{"kind": "local"},
				"status":       "running",
				"startedAt":    occurredAt.Add(123456789 * time.Nanosecond).Format(time.RFC3339Nano),
				"endedAt":      "",
				"summary":      map[string]any{"totalItems": 0},
			}},
		},
	}

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.results.persist", request, occurredAt)
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}
	if !strings.Contains(sql, "UPSERT type::record('ai_experiment_run'") {
		t.Fatalf("query = %s, want ai_experiment_run table", sql)
	}
	record := vars["record"].(map[string]any)
	if vars["record_id"] != "run-1" || record["experimentId"] != "experiment-1" || record["status"] != "running" {
		t.Fatalf("record = %#v, want experiment run status", record)
	}
	if _, ok := record["startedAt"].(time.Time); !ok {
		t.Fatalf("startedAt = %#v, want parsed time.Time", record["startedAt"])
	}
	if _, ok := record["endedAt"]; ok {
		t.Fatalf("record = %#v, want omitted optional endedAt", record)
	}
	if data["id"] != "run-1" {
		t.Fatalf("data = %#v, want run response data", data)
	}
}

func TestPersisterImplementsAIPorts(t *testing.T) {
	db := &fakeDB{}
	p := Persister{DB: db}
	command := validAIProjectionPersistCommand()

	exists, err := p.AIProjectionCommandExists(context.Background(), command)
	if err != nil {
		t.Fatalf("AIProjectionCommandExists() error = %v", err)
	}
	if exists {
		t.Fatal("AIProjectionCommandExists() = true, want false")
	}
	projectionIDs, err := p.PersistAIProjection(context.Background(), command, "telemetry.ingest.ai_projections", time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("PersistAIProjection() error = %v", err)
	}
	if strings.Join(projectionIDs, ",") != "agent-run-1" {
		t.Fatalf("projectionIDs = %#v", projectionIDs)
	}
	if !strings.Contains(db.sql, "ai_agent_run") {
		t.Fatalf("query = %s, want ai_agent_run", db.sql)
	}

	_, err = p.PersistEvalMutation(context.Background(), "eval.dataset.create", contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-dataset-1", IssuedAt: time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)},
		Input:          map[string]any{"name": "golden answers"},
	}, time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("PersistEvalMutation() error = %v", err)
	}
	if !strings.Contains(db.sql, "ai_dataset") {
		t.Fatalf("query = %s, want ai_dataset", db.sql)
	}
}

type fakeDB struct {
	sql           string
	vars          map[string]any
	commandExists bool
	target        TelemetryTarget
}

func (db *fakeDB) QueryInTarget(_ context.Context, target TelemetryTarget, sql string, vars map[string]any) error {
	db.target = target
	db.sql = sql
	db.vars = vars
	return nil
}

func (db *fakeDB) IngestCommandExistsInTarget(_ context.Context, target TelemetryTarget, commandID string) (bool, error) {
	db.target = target
	if commandID != "cmd-1" {
		return false, nil
	}
	return db.commandExists, nil
}

type traceRecorder struct {
	spans []selfobs.SpanEvent
	logs  []selfobs.LogEvent
}

func (recorder *traceRecorder) RecordSpan(event selfobs.SpanEvent) {
	recorder.spans = append(recorder.spans, event)
}

func (recorder *traceRecorder) RecordLog(event selfobs.LogEvent) {
	recorder.logs = append(recorder.logs, event)
}

func (recorder *traceRecorder) Flush(context.Context) error { return nil }

func (recorder *traceRecorder) Shutdown(context.Context) error { return nil }

func stringPtr(value string) *string {
	return &value
}

func floatPtr(value float64) *float64 {
	return &value
}

func validPersistCommand() contracts.PersistTelemetryCommand {
	return contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1"},
		CommandID:      "cmd-1",
		Source:         "otlp-traces",
		Traces: []contracts.Trace{{
			ID:         "trace-1",
			StartedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			Attributes: contracts.Attributes{},
		}},
	}
}

func validAIProjectionPersistCommand() contracts.PersistAiProjectionCommand {
	tenantID := "tenant_1"
	projectID := "project_1"
	return contracts.PersistAiProjectionCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-ai-1",
			IssuedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			AuthContext: &contracts.AuthContext{
				Mode:      "service",
				TenantID:  &tenantID,
				ProjectID: &projectID,
			},
		},
		CommandID: "cmd-ai-1",
		TraceID:   "trace-1",
		SpanID:    "span-1",
		Kind:      contracts.AiProjectionKindAgentRun,
		Projection: map[string]any{
			"id":             "agent-run-1",
			"traceId":        "trace-1",
			"rootSpanId":     "span-1",
			"parentSpanId":   "parent-1",
			"agent":          map[string]any{"name": "support-agent"},
			"startedAt":      time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC).Format(time.RFC3339),
			"status":         "ok",
			"contentDigests": []string{"sha256:input", "sha256:output"},
			"contentSources": []string{"attribute:gen_ai.input", "attribute:gen_ai.output"},
		},
	}
}

func validMetricsPersistCommand() contracts.PersistMetricsCommand {
	return contracts.PersistMetricsCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-metrics-1",
			IssuedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
		},
		CommandID: "cmd-1",
		Source:    "otlp-metrics",
		Descriptors: []contracts.MetricDescriptor{{
			ID:          "orders-created",
			Name:        "orders.created",
			Kind:        contracts.MetricKindSum,
			Unit:        "1",
			FirstSeenAt: time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
			LastSeenAt:  time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
		}},
		Points: []contracts.MetricPoint{{
			ID:         "orders-created-point",
			MetricName: "orders.created",
			Kind:       contracts.MetricKindSum,
			Timestamp:  time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
			Value:      floatPtr(7),
			Attributes: contracts.Attributes{},
			Exemplars:  []contracts.MetricExemplar{},
		}},
	}
}

func metricExemplars(count int) []contracts.MetricExemplar {
	exemplars := make([]contracts.MetricExemplar, 0, count)
	for i := 0; i < count; i++ {
		exemplars = append(exemplars, contracts.MetricExemplar{
			Timestamp:  time.Date(2026, 5, 8, 8, 0, i, 0, time.UTC),
			Value:      float64(i),
			TraceID:    stringPtr("trace-1"),
			SpanID:     stringPtr("span-1"),
			Attributes: contracts.Attributes{"index": i},
		})
	}
	return exemplars
}
