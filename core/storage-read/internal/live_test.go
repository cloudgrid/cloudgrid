package internal

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestLiveTraceStartRegistersSubscriptionAndEmitsHeartbeat(t *testing.T) {
	now := fixedLiveNow()
	store := &liveTestStore{}
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(store, publisher, LiveTraceOptions{
		HeartbeatInterval: 15 * time.Second,
		MaxSubscriptions:  10,
		Now:               func() time.Time { return now },
	})

	data, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	if data.SubscriptionID != "sub-1" || data.HeartbeatIntervalMs != 15000 {
		t.Fatalf("start data = %#v, want subscription id and heartbeat interval", data)
	}
	if registry.Count() != 1 {
		t.Fatalf("subscription count = %d, want 1", registry.Count())
	}
	event := decodePublishedLiveEvent(t, publisher.events[0])
	if event.SubscriptionID != "sub-1" || event.Type != contracts.LiveTraceEventTypeHeartbeat || event.Seq != 1 {
		t.Fatalf("heartbeat event = %#v, want sub-1 heartbeat seq 1", event)
	}
	if !event.ReceivedAt.Equal(now) {
		t.Fatalf("heartbeat receivedAt = %s, want %s", event.ReceivedAt, now)
	}
}

func TestLiveTraceStartRetainsAuthContextForFutureReadAuthorization(t *testing.T) {
	readAllowed := true
	principalID := "principal-1"
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{
		Now: fixedLiveNow,
	})

	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-start",
			AuthContext: &contracts.AuthContext{
				Mode:        "authenticated",
				PrincipalID: &principalID,
				Scopes:      []string{"telemetry:read"},
				ReadAllowed: &readAllowed,
			},
		},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	registry.mu.Lock()
	subscription := registry.subscriptions["sub-1"]
	registry.mu.Unlock()
	if subscription == nil || subscription.authContext == nil {
		t.Fatalf("subscription auth context was not retained: %#v", subscription)
	}
	if subscription.authContext.Mode != "authenticated" ||
		subscription.authContext.PrincipalID == nil ||
		*subscription.authContext.PrincipalID != principalID ||
		subscription.authContext.ReadAllowed == nil ||
		!*subscription.authContext.ReadAllowed {
		t.Fatalf("subscription auth context = %#v", subscription.authContext)
	}
}

func TestLiveTraceStopIsIdempotentAndUnknownStopSucceeds(t *testing.T) {
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{
		HeartbeatInterval: 15 * time.Second,
		MaxSubscriptions:  10,
		Now:               fixedLiveNow,
	})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	for _, subscriptionID := range []string{"sub-1", "sub-1", "missing"} {
		data, err := registry.Stop(contracts.LiveTraceStopRequest{
			BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-stop"},
			SubscriptionID: subscriptionID,
		})
		if err != nil {
			t.Fatalf("Stop(%q) returned error: %v", subscriptionID, err)
		}
		if data.SubscriptionID != subscriptionID {
			t.Fatalf("stop data = %#v, want subscription id %q", data, subscriptionID)
		}
	}
	if registry.Count() != 0 {
		t.Fatalf("subscription count = %d, want 0", registry.Count())
	}
}

func TestLiveTraceNotificationResolvesCandidatesAndSequencesAddedAndUpdatedEvents(t *testing.T) {
	now := fixedLiveNow()
	store := &liveTestStore{
		candidates: []contracts.TraceSummary{
			liveTraceSummary("trace-1", "api", contracts.TraceStatusOK, now.Add(-time.Second), 12),
			liveTraceSummary("trace-2", "api", contracts.TraceStatusError, now.Add(-2*time.Second), 30),
		},
	}
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(store, publisher, LiveTraceOptions{
		HeartbeatInterval: 15 * time.Second,
		MaxSubscriptions:  10,
		Now:               func() time.Time { return now },
	})
	service := "api"
	status := contracts.TraceStatusOK
	from := now.Add(-time.Minute)
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query: contracts.LiveTraceQuery{
			Service: &service,
			Status:  &status,
			From:    &from,
		},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	notification := contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-notify"},
		CommandID:      "cmd-1",
		TraceIDs:       []string{"trace-1", "trace-2"},
		PersistedAt:    now,
	}
	if err := registry.HandleTracePersisted(context.Background(), notification); err != nil {
		t.Fatalf("HandleTracePersisted returned error: %v", err)
	}
	if err := registry.HandleTracePersisted(context.Background(), notification); err != nil {
		t.Fatalf("HandleTracePersisted second call returned error: %v", err)
	}

	if len(store.liveCandidateCalls) != 2 {
		t.Fatalf("candidate call count = %d, want 2", len(store.liveCandidateCalls))
	}
	if got := store.liveCandidateCalls[0].traceIDs; len(got) != 2 || got[0] != "trace-1" || got[1] != "trace-2" {
		t.Fatalf("candidate trace ids = %#v, want notification trace IDs", got)
	}
	if store.liveCandidateCalls[0].query.Service == nil || *store.liveCandidateCalls[0].query.Service != service {
		t.Fatalf("candidate query = %#v, want live service filter", store.liveCandidateCalls[0].query)
	}

	events := decodePublishedLiveEvents(t, publisher.events)
	if len(events) != 3 {
		t.Fatalf("published events = %d, want heartbeat plus two data events", len(events))
	}
	if events[1].Type != contracts.LiveTraceEventTypeAdded || events[1].Seq != 2 || events[1].Trace == nil || events[1].Trace.ID != "trace-1" {
		t.Fatalf("first data event = %#v, want added trace-1 seq 2", events[1])
	}
	if events[2].Type != contracts.LiveTraceEventTypeUpdated || events[2].Seq != 3 || events[2].Trace == nil || events[2].Trace.ID != "trace-1" {
		t.Fatalf("second data event = %#v, want updated trace-1 seq 3", events[2])
	}
}

func TestLiveTraceFilterMatchingUsesResolvedTraceSummaries(t *testing.T) {
	now := fixedLiveNow()
	attrValue := "prod"
	store := &liveTestStore{
		candidates: []contracts.TraceSummary{
			liveTraceSummaryWithAttributes("trace-1", "api", contracts.TraceStatusOK, now, 10, contracts.Attributes{"env": attrValue}),
			liveTraceSummaryWithAttributes("trace-2", "worker", contracts.TraceStatusOK, now, 10, contracts.Attributes{"env": attrValue}),
			liveTraceSummaryWithAttributes("trace-3", "api", contracts.TraceStatusError, now, 10, contracts.Attributes{"env": attrValue}),
			liveTraceSummaryWithAttributes("trace-4", "api", contracts.TraceStatusOK, now, 10, contracts.Attributes{"env": "dev"}),
		},
	}
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(store, publisher, LiveTraceOptions{
		HeartbeatInterval: 15 * time.Second,
		MaxSubscriptions:  10,
		Now:               func() time.Time { return now },
	})
	service := "api"
	status := contracts.TraceStatusOK
	attributeFilter := contracts.AttributeFilter{Key: "env", Operator: contracts.AttributeFilterOperatorEQ, Value: attrValue}
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{Service: &service, Status: &status, Attributes: []contracts.AttributeFilter{attributeFilter}},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	err = registry.HandleTracePersisted(context.Background(), contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-notify"},
		CommandID:      "cmd-1",
		TraceIDs:       []string{"trace-1", "trace-2", "trace-3"},
		PersistedAt:    now,
	})
	if err != nil {
		t.Fatalf("HandleTracePersisted returned error: %v", err)
	}

	events := decodePublishedLiveEvents(t, publisher.events)
	if len(events) != 2 {
		t.Fatalf("published events = %#v, want heartbeat plus one matching trace", events)
	}
	if events[1].Trace == nil || events[1].Trace.ID != "trace-1" {
		t.Fatalf("data event = %#v, want only trace-1", events[1])
	}
}

func TestLiveTraceStartEnforcesSubscriptionLimit(t *testing.T) {
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{
		HeartbeatInterval: 15 * time.Second,
		MaxSubscriptions:  1,
		Now:               fixedLiveNow,
	})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start-1"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start first subscription returned error: %v", err)
	}

	_, err = registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start-2"},
		SubscriptionID: "sub-2",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-2",
		Query:          contracts.LiveTraceQuery{},
	})
	if err == nil {
		t.Fatal("Start second subscription succeeded, want limit error")
	}
	bridgeErr := bridgeErrorFromError(err)
	if bridgeErr.ID != "ERR-017" || bridgeErr.Code != "SUBSCRIPTION_LIMIT_EXCEEDED" {
		t.Fatalf("limit error = %#v, want ERR-017", bridgeErr)
	}
}

func TestLiveTraceStartValidatesRequiredFieldsAndLiveQueryBounds(t *testing.T) {
	tests := []struct {
		name    string
		request contracts.LiveTraceStartRequest
		wantID  string
	}{
		{
			name: "subscription id required",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: " ",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{},
			},
			wantID: "ERR-001",
		},
		{
			name: "sink subject required",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    " ",
				Query:          contracts.LiveTraceQuery{},
			},
			wantID: "ERR-001",
		},
		{
			name: "sink subject must be live event subject",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.persisted.traces",
				Query:          contracts.LiveTraceQuery{},
			},
			wantID: "ERR-001",
		},
		{
			name: "limit lower bound",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{Limit: intPtr(0)},
			},
			wantID: "ERR-001",
		},
		{
			name: "limit upper bound",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{Limit: intPtr(501)},
			},
			wantID: "ERR-001",
		},
		{
			name: "negative min duration",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{MinDurationMs: floatPtr(-1)},
			},
			wantID: "ERR-001",
		},
		{
			name: "negative max duration",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{MaxDurationMs: floatPtr(-1)},
			},
			wantID: "ERR-001",
		},
		{
			name: "min duration cannot exceed max duration",
			request: contracts.LiveTraceStartRequest{
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{MinDurationMs: floatPtr(10), MaxDurationMs: floatPtr(5)},
			},
			wantID: "ERR-001",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow})
			_, err := registry.Start(context.Background(), tt.request)
			if err == nil {
				t.Fatal("Start succeeded, want validation error")
			}
			bridgeErr := bridgeErrorFromError(err)
			if bridgeErr.ID != tt.wantID {
				t.Fatalf("validation error = %#v, want id %s", bridgeErr, tt.wantID)
			}
			if registry.Count() != 0 {
				t.Fatalf("subscription count = %d, want 0 after failed start", registry.Count())
			}
		})
	}
}

func TestLiveTraceStartRejectsDeniedReadAuthorization(t *testing.T) {
	readAllowed := false
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow})

	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-start",
			AuthContext: &contracts.AuthContext{Mode: "authenticated", ReadAllowed: &readAllowed},
		},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err == nil {
		t.Fatal("Start succeeded, want forbidden error")
	}
	bridgeErr := bridgeErrorFromError(err)
	if bridgeErr.ID != "ERR-016" || bridgeErr.Code != "FORBIDDEN" || bridgeErr.Retryable {
		t.Fatalf("authorization error = %#v, want non-retryable ERR-016", bridgeErr)
	}
}

func TestLiveTraceStartRemovesSubscriptionWhenInitialHeartbeatPublishFails(t *testing.T) {
	publisher := &liveTestPublisher{err: errors.New("publish failed")}
	registry := NewLiveTraceRegistry(&liveTestStore{}, publisher, LiveTraceOptions{Now: fixedLiveNow})

	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err == nil {
		t.Fatal("Start succeeded, want publish error")
	}
	bridgeErr := bridgeErrorFromError(err)
	if bridgeErr.ID != "ERR-013" || bridgeErr.Code != "MESSAGE_BRIDGE_UNAVAILABLE" || !bridgeErr.Retryable {
		t.Fatalf("publish error = %#v, want retryable ERR-013", bridgeErr)
	}
	if registry.Count() != 0 {
		t.Fatalf("subscription count = %d, want failed subscription removed", registry.Count())
	}
}

func TestLiveTraceHeartbeatsRespectIntervalAndRemoveFailedSubscriptions(t *testing.T) {
	now := fixedLiveNow()
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(&liveTestStore{}, publisher, LiveTraceOptions{
		HeartbeatInterval: time.Second,
		MaxSubscriptions:  10,
		Now:               func() time.Time { return now },
	})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	registry.EmitHeartbeats(context.Background())
	if len(publisher.events) != 1 {
		t.Fatalf("events = %d, want only initial heartbeat before interval", len(publisher.events))
	}

	now = now.Add(time.Second)
	registry.EmitHeartbeats(context.Background())
	events := decodePublishedLiveEvents(t, publisher.events)
	if len(events) != 2 || events[1].Type != contracts.LiveTraceEventTypeHeartbeat || events[1].Seq != 2 {
		t.Fatalf("events = %#v, want second heartbeat seq 2 after interval", events)
	}

	publisher.err = errors.New("publish failed")
	now = now.Add(time.Second)
	registry.EmitHeartbeats(context.Background())
	if registry.Count() != 0 {
		t.Fatalf("subscription count = %d, want failed heartbeat to remove subscription", registry.Count())
	}
}

func TestLiveTraceNotificationCleansTraceIDsAndSkipsEmptyNotifications(t *testing.T) {
	store := &liveTestStore{}
	registry := NewLiveTraceRegistry(store, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	err = registry.HandleTracePersisted(context.Background(), contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-empty"},
		CommandID:      "cmd-empty",
		TraceIDs:       []string{" ", ""},
		PersistedAt:    fixedLiveNow(),
	})
	if err != nil {
		t.Fatalf("empty HandleTracePersisted returned error: %v", err)
	}
	if len(store.liveCandidateCalls) != 0 {
		t.Fatalf("candidate calls = %d, want none for empty notification", len(store.liveCandidateCalls))
	}

	err = registry.HandleTracePersisted(context.Background(), contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-clean"},
		CommandID:      "cmd-clean",
		TraceIDs:       []string{" trace-1 ", "trace-1", "trace-2"},
		PersistedAt:    fixedLiveNow(),
	})
	if err != nil {
		t.Fatalf("HandleTracePersisted returned error: %v", err)
	}
	got := store.liveCandidateCalls[0].traceIDs
	if len(got) != 2 || got[0] != "trace-1" || got[1] != "trace-2" {
		t.Fatalf("cleaned trace ids = %#v, want trimmed unique IDs", got)
	}
}

func TestLiveTraceNotificationRemovesSubscriptionWhenDataPublishFails(t *testing.T) {
	now := fixedLiveNow()
	store := &liveTestStore{candidates: []contracts.TraceSummary{
		liveTraceSummary("trace-1", "api", contracts.TraceStatusOK, now, 12),
	}}
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(store, publisher, LiveTraceOptions{Now: func() time.Time { return now }})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	publisher.err = errors.New("publish failed")
	err = registry.HandleTracePersisted(context.Background(), contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-notify"},
		CommandID:      "cmd-1",
		TraceIDs:       []string{"trace-1"},
		PersistedAt:    now,
	})
	if err != nil {
		t.Fatalf("HandleTracePersisted returned error: %v", err)
	}
	if registry.Count() != 0 {
		t.Fatalf("subscription count = %d, want failed subscription removed", registry.Count())
	}
}

func TestLiveTraceSummaryMatchingCoversQueryDurationsAndAttributeOperators(t *testing.T) {
	now := fixedLiveNow()
	rootSpanID := "root-1"
	trace := liveTraceSummaryWithAttributes("trace-1", "api", contracts.TraceStatusOK, now, 25, contracts.Attributes{
		"env":       "prod",
		"region":    "eu-central",
		"attempt":   3,
		"component": "checkout",
	})
	trace.RootSpanID = &rootSpanID
	trace.OperationName = stringPtr("POST /checkout")

	tests := []struct {
		name  string
		query contracts.LiveTraceQuery
		want  bool
	}{
		{name: "text matches trace id", query: contracts.LiveTraceQuery{Query: stringPtr("TRACE-1")}, want: true},
		{name: "text matches service", query: contracts.LiveTraceQuery{Query: stringPtr("API")}, want: true},
		{name: "text matches root span", query: contracts.LiveTraceQuery{Query: stringPtr("root")}, want: true},
		{name: "text matches operation name", query: contracts.LiveTraceQuery{Query: stringPtr("post /checkout")}, want: true},
		{name: "operation name matches", query: contracts.LiveTraceQuery{OperationName: stringPtr("POST /checkout")}, want: true},
		{name: "operation name mismatch", query: contracts.LiveTraceQuery{OperationName: stringPtr("GET /checkout")}, want: false},
		{name: "text matches attribute key", query: contracts.LiveTraceQuery{Query: stringPtr("component")}, want: true},
		{name: "text matches attribute value", query: contracts.LiveTraceQuery{Query: stringPtr("checkout")}, want: true},
		{name: "text mismatch", query: contracts.LiveTraceQuery{Query: stringPtr("worker")}, want: false},
		{name: "from excludes older trace", query: contracts.LiveTraceQuery{From: timePtr(now.Add(time.Second))}, want: false},
		{name: "min duration includes trace", query: contracts.LiveTraceQuery{MinDurationMs: floatPtr(20)}, want: true},
		{name: "min duration excludes trace", query: contracts.LiveTraceQuery{MinDurationMs: floatPtr(26)}, want: false},
		{name: "max duration includes trace", query: contracts.LiveTraceQuery{MaxDurationMs: floatPtr(25)}, want: true},
		{name: "max duration excludes trace", query: contracts.LiveTraceQuery{MaxDurationMs: floatPtr(24)}, want: false},
		{name: "exists matches", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "env", Operator: contracts.AttributeFilterOperatorExists}}}, want: true},
		{name: "eq matches stringified number", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "attempt", Operator: contracts.AttributeFilterOperatorEQ, Value: "3"}}}, want: true},
		{name: "neq matches missing attribute", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "missing", Operator: contracts.AttributeFilterOperatorNEQ, Value: "x"}}}, want: true},
		{name: "contains matches case-insensitively", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "region", Operator: contracts.AttributeFilterOperatorContains, Value: "CENTRAL"}}}, want: true},
		{name: "in matches list", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "env", Operator: contracts.AttributeFilterOperatorIN, Value: []any{"dev", "prod"}}}}, want: true},
		{name: "not in excludes listed value", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "env", Operator: contracts.AttributeFilterOperatorNotIN, Value: []string{"prod"}}}}, want: false},
		{name: "gt matches number", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "attempt", Operator: contracts.AttributeFilterOperatorGT, Value: 2}}}, want: true},
		{name: "gte matches number", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "attempt", Operator: contracts.AttributeFilterOperatorGTE, Value: 3.0}}}, want: true},
		{name: "lt matches number", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "attempt", Operator: contracts.AttributeFilterOperatorLT, Value: 4}}}, want: true},
		{name: "lte matches number", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "attempt", Operator: contracts.AttributeFilterOperatorLTE, Value: 3}}}, want: true},
		{name: "unknown operator fails", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: "env", Operator: contracts.AttributeFilterOperator("prefix"), Value: "pro"}}}, want: false},
		{name: "blank attribute key fails", query: contracts.LiveTraceQuery{Attributes: []contracts.AttributeFilter{{Key: " ", Operator: contracts.AttributeFilterOperatorExists}}}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchesLiveTraceSummary(tt.query, trace); got != tt.want {
				t.Fatalf("matchesLiveTraceSummary() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestLiveTraceSummaryMatchingHandlesMissingOptionalFields(t *testing.T) {
	trace := contracts.TraceSummary{Trace: contracts.Trace{ID: "trace-1", StartedAt: fixedLiveNow(), Attributes: contracts.Attributes{}}}

	tests := []contracts.LiveTraceQuery{
		{Service: stringPtr("api")},
		{Status: statusPtr(contracts.TraceStatusOK)},
		{OperationName: stringPtr("POST /checkout")},
		{MinDurationMs: floatPtr(1)},
		{MaxDurationMs: floatPtr(1)},
	}

	for _, query := range tests {
		if matchesLiveTraceSummary(query, trace) {
			t.Fatalf("matchesLiveTraceSummary(%#v) = true, want false for missing optional trace fields", query)
		}
	}
}

func TestLiveTraceSummaryContainsHandlesNestedAttributesAndUnmarshalableValues(t *testing.T) {
	service := "checkout"
	root := "root-span"
	trace := contracts.TraceSummary{Trace: contracts.Trace{
		ID:          "trace-1",
		ServiceName: &service,
		RootSpanID:  &root,
		StartedAt:   fixedLiveNow(),
		Attributes: contracts.Attributes{
			"nested": map[string]any{"error": "timeout"},
			"bad":    func() {},
		},
	}}

	for _, query := range []string{"TRACE-1", "CHECKOUT", "ROOT-SPAN", "nested", "timeout"} {
		if !traceSummaryContains(trace, query) {
			t.Fatalf("traceSummaryContains(%q) = false, want true", query)
		}
	}
	if traceSummaryContains(trace, "missing") {
		t.Fatal("traceSummaryContains returned true for missing text")
	}
	if got := jsonScalar(func() {}); got != "" {
		t.Fatalf("jsonScalar(unmarshalable) = %q, want empty string", got)
	}
	if compareAttributeValue(1, 2, "unknown") {
		t.Fatal("compareAttributeValue returned true for unsupported operator")
	}
}

type liveCandidateCall struct {
	query    contracts.LiveTraceQuery
	traceIDs []string
}

type liveTestStore struct {
	candidates         []contracts.TraceSummary
	liveCandidateCalls []liveCandidateCall
	err                error
}

func (store *liveTestStore) GetProjectTelemetryOverviews(_ context.Context, _ contracts.ProjectTelemetryOverviewRequest) (contracts.ProjectTelemetryOverviewData, error) {
	return contracts.ProjectTelemetryOverviewData{Items: []contracts.ProjectTelemetryOverviewItem{}}, nil
}

func (store *liveTestStore) SearchTraces(_ context.Context, _ contracts.TraceSearchQuery) (contracts.TraceSearchData, error) {
	return contracts.TraceSearchData{Items: []contracts.TraceSummary{}}, nil
}

func (store *liveTestStore) SearchLiveTraceCandidates(_ context.Context, query contracts.LiveTraceQuery, traceIDs []string) ([]contracts.TraceSummary, error) {
	store.liveCandidateCalls = append(store.liveCandidateCalls, liveCandidateCall{query: query, traceIDs: append([]string(nil), traceIDs...)})
	if store.err != nil {
		return nil, store.err
	}
	return append([]contracts.TraceSummary(nil), store.candidates...), nil
}

func (store *liveTestStore) GetTraceDetail(_ context.Context, _ string, _ *contracts.TraceDetailQuery) (*contracts.TraceDetailData, error) {
	return &contracts.TraceDetailData{}, nil
}

func (store *liveTestStore) SearchLogs(_ context.Context, _ contracts.LogSearchQuery) (contracts.LogSearchData, error) {
	return contracts.LogSearchData{Items: []contracts.LogEvent{}}, nil
}

func (store *liveTestStore) GetTelemetryFacets(_ context.Context, _ contracts.TelemetryFacetQuery) (contracts.TelemetryFacetData, error) {
	return contracts.TelemetryFacetData{}, nil
}

func (store *liveTestStore) SearchMetricNames(_ context.Context, _ contracts.MetricNameSearchInput, _ *contracts.AuthContext) (contracts.MetricNameSearchData, error) {
	return contracts.MetricNameSearchData{Items: []contracts.MetricDescriptor{}}, nil
}

func (store *liveTestStore) QueryMetricSeries(_ context.Context, _ contracts.MetricSeriesInput, _ *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	return contracts.MetricSeriesData{}, nil
}

type liveTestPublisher struct {
	events []publishedLiveEvent
	err    error
}

type publishedLiveEvent struct {
	subject string
	data    []byte
}

func (publisher *liveTestPublisher) Publish(subject string, data []byte) error {
	if publisher.err != nil {
		return publisher.err
	}
	publisher.events = append(publisher.events, publishedLiveEvent{subject: subject, data: append([]byte(nil), data...)})
	return nil
}

func decodePublishedLiveEvents(t *testing.T, events []publishedLiveEvent) []contracts.LiveTraceEvent {
	t.Helper()
	decoded := make([]contracts.LiveTraceEvent, 0, len(events))
	for _, event := range events {
		decoded = append(decoded, decodePublishedLiveEvent(t, event))
	}
	return decoded
}

func decodePublishedLiveEvent(t *testing.T, event publishedLiveEvent) contracts.LiveTraceEvent {
	t.Helper()
	if event.subject == "" {
		t.Fatal("event subject is empty")
	}
	var decoded contracts.LiveTraceEvent
	if err := json.Unmarshal(event.data, &decoded); err != nil {
		t.Fatalf("event is not LiveTraceEvent JSON: %v", err)
	}
	return decoded
}

func liveTraceSummary(id string, service string, status contracts.TraceStatus, startedAt time.Time, durationMs float64) contracts.TraceSummary {
	return liveTraceSummaryWithAttributes(id, service, status, startedAt, durationMs, contracts.Attributes{})
}

func liveTraceSummaryWithAttributes(id string, service string, status contracts.TraceStatus, startedAt time.Time, durationMs float64, attributes contracts.Attributes) contracts.TraceSummary {
	return contracts.TraceSummary{
		Trace: contracts.Trace{
			ID:          id,
			ServiceName: &service,
			StartedAt:   startedAt,
			DurationMs:  &durationMs,
			Status:      &status,
			Attributes:  attributes,
		},
		SpanCount:      1,
		ErrorSpanCount: 0,
		LogCount:       0,
		ServiceCount:   1,
	}
}

func fixedLiveNow() time.Time {
	return time.Date(2026, 5, 10, 9, 30, 0, 0, time.UTC)
}

func intPtr(value int) *int {
	return &value
}

func floatPtr(value float64) *float64 {
	return &value
}

func stringPtr(value string) *string {
	return &value
}

func timePtr(value time.Time) *time.Time {
	return &value
}

func statusPtr(value contracts.TraceStatus) *contracts.TraceStatus {
	return &value
}

func TestLiveTraceNotificationReturnsCandidateResolutionErrors(t *testing.T) {
	registry := NewLiveTraceRegistry(&liveTestStore{err: errors.New("ERR-006 STORAGE_UNAVAILABLE: unavailable")}, &liveTestPublisher{}, LiveTraceOptions{
		HeartbeatInterval: 15 * time.Second,
		MaxSubscriptions:  10,
		Now:               fixedLiveNow,
	})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	err = registry.HandleTracePersisted(context.Background(), contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-notify"},
		CommandID:      "cmd-1",
		TraceIDs:       []string{"trace-1"},
		PersistedAt:    fixedLiveNow(),
	})
	if err == nil {
		t.Fatal("HandleTracePersisted succeeded, want candidate resolution error")
	}
}
