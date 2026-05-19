package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
)

const (
	defaultLiveHeartbeatInterval    = 15 * time.Second
	defaultLiveDeliveryTimeout      = 45 * time.Second
	defaultLiveTraceEventBufferSize = 100
	defaultMaxLiveSubscriptions     = 500
	defaultLiveLimit                = 100
	maxLiveLimit                    = 500
)

type LiveTracePublisher interface {
	Publish(subject string, data []byte) error
}

type LiveTraceOptions struct {
	HeartbeatInterval time.Duration
	DeliveryTimeout   time.Duration
	EventBufferSize   int
	MaxSubscriptions  int
	Now               func() time.Time
}

type LiveTraceRegistry struct {
	store             ports.TelemetryReadStore
	publisher         LiveTracePublisher
	heartbeatInterval time.Duration
	deliveryTimeout   time.Duration
	eventBufferSize   int
	maxSubscriptions  int
	now               func() time.Time

	mu            sync.Mutex
	subscriptions map[string]*liveTraceSubscription
}

type liveTraceSubscription struct {
	id           string
	sinkSubject  string
	query        contracts.LiveTraceQuery
	authContext  *contracts.AuthContext
	createdAt    time.Time
	lastBeat     time.Time
	lastProgress time.Time
	nextSeq      int
	inFlight     int
	emitted      map[string]bool
}

func NewLiveTraceRegistry(store ports.TelemetryReadStore, publisher LiveTracePublisher, options LiveTraceOptions) *LiveTraceRegistry {
	heartbeatInterval := options.HeartbeatInterval
	if heartbeatInterval <= 0 {
		heartbeatInterval = defaultLiveHeartbeatInterval
	}
	deliveryTimeout := options.DeliveryTimeout
	if deliveryTimeout <= 0 {
		deliveryTimeout = defaultLiveDeliveryTimeout
	}
	eventBufferSize := options.EventBufferSize
	if eventBufferSize <= 0 {
		eventBufferSize = defaultLiveTraceEventBufferSize
	}
	maxSubscriptions := options.MaxSubscriptions
	if maxSubscriptions <= 0 {
		maxSubscriptions = defaultMaxLiveSubscriptions
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	return &LiveTraceRegistry{
		store:             store,
		publisher:         publisher,
		heartbeatInterval: heartbeatInterval,
		deliveryTimeout:   deliveryTimeout,
		eventBufferSize:   eventBufferSize,
		maxSubscriptions:  maxSubscriptions,
		now:               now,
		subscriptions:     map[string]*liveTraceSubscription{},
	}
}

func (registry *LiveTraceRegistry) Count() int {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return len(registry.subscriptions)
}

func (registry *LiveTraceRegistry) Start(ctx context.Context, request contracts.LiveTraceStartRequest) (contracts.LiveTraceStartData, error) {
	if err := validateLiveStart(request); err != nil {
		return contracts.LiveTraceStartData{}, err
	}
	if err := validateLiveQuery(request.Query); err != nil {
		return contracts.LiveTraceStartData{}, err
	}
	if err := validateTelemetryLive(request.AuthContext); err != nil {
		return contracts.LiveTraceStartData{}, err
	}

	now := registry.now().UTC()
	subscription := &liveTraceSubscription{
		id:           request.SubscriptionID,
		sinkSubject:  request.SinkSubject,
		query:        normalizeLiveQuery(request.Query, now),
		authContext:  request.AuthContext,
		createdAt:    now,
		lastBeat:     now,
		lastProgress: now,
		nextSeq:      1,
		emitted:      map[string]bool{},
	}

	registry.mu.Lock()
	if _, exists := registry.subscriptions[request.SubscriptionID]; !exists && len(registry.subscriptions) >= registry.maxSubscriptions {
		registry.mu.Unlock()
		return contracts.LiveTraceStartData{}, bridgeError("ERR-017", "SUBSCRIPTION_LIMIT_EXCEEDED", "Too many live telemetry subscriptions are open", true)
	}
	registry.subscriptions[request.SubscriptionID] = subscription
	registry.mu.Unlock()

	if err := registry.publish(ctx, subscription, contracts.LiveTraceEventTypeHeartbeat, nil); err != nil {
		registry.remove(request.SubscriptionID)
		return contracts.LiveTraceStartData{}, bridgeError("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "Message bridge is unavailable", true)
	}

	return contracts.LiveTraceStartData{
		SubscriptionID:      request.SubscriptionID,
		HeartbeatIntervalMs: int(registry.heartbeatInterval / time.Millisecond),
	}, nil
}

func (registry *LiveTraceRegistry) Stop(request contracts.LiveTraceStopRequest) (contracts.LiveTraceStopData, error) {
	registry.remove(request.SubscriptionID)
	return contracts.LiveTraceStopData{SubscriptionID: request.SubscriptionID}, nil
}

func (registry *LiveTraceRegistry) HandleTracePersisted(ctx context.Context, notification contracts.TracePersistedNotification) error {
	traceIDs := cleanTraceIDs(notification.TraceIDs)
	if len(traceIDs) == 0 {
		return nil
	}

	subscriptions := registry.snapshotSubscriptions()
	for _, subscription := range subscriptions {
		if err := validateTelemetryLive(subscription.authContext); err != nil {
			return err
		}
		items, err := registry.store.SearchLiveTraceCandidates(ctx, subscription.query, traceIDs, subscription.authContext)
		if err != nil {
			return err
		}
		for index := range items {
			trace := items[index]
			if !matchesLiveTraceSummary(subscription.query, trace) {
				continue
			}
			eventType := registry.markEmitted(subscription, trace.ID)
			if err := registry.publish(ctx, subscription, eventType, &trace); err != nil {
				registry.remove(subscription.id)
				continue
			}
		}
	}
	return nil
}

func (registry *LiveTraceRegistry) EmitHeartbeats(ctx context.Context) {
	now := registry.now().UTC()
	for _, subscription := range registry.snapshotSubscriptions() {
		if registry.subscriptionStalled(subscription, now) {
			registry.remove(subscription.id)
			continue
		}
		if now.Sub(subscription.lastBeat) < registry.heartbeatInterval {
			continue
		}
		if err := registry.publish(ctx, subscription, contracts.LiveTraceEventTypeHeartbeat, nil); err != nil {
			registry.remove(subscription.id)
		}
	}
}

func (registry *LiveTraceRegistry) snapshotSubscriptions() []*liveTraceSubscription {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	subscriptions := make([]*liveTraceSubscription, 0, len(registry.subscriptions))
	for _, subscription := range registry.subscriptions {
		subscriptions = append(subscriptions, subscription)
	}
	return subscriptions
}

func (registry *LiveTraceRegistry) remove(subscriptionID string) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	delete(registry.subscriptions, subscriptionID)
}

func (registry *LiveTraceRegistry) markEmitted(subscription *liveTraceSubscription, traceID string) contracts.LiveTraceEventType {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if subscription.emitted[traceID] {
		return contracts.LiveTraceEventTypeUpdated
	}
	subscription.emitted[traceID] = true
	return contracts.LiveTraceEventTypeAdded
}

func (registry *LiveTraceRegistry) publish(_ context.Context, subscription *liveTraceSubscription, eventType contracts.LiveTraceEventType, trace *contracts.TraceSummary) error {
	registry.mu.Lock()
	if registry.subscriptions[subscription.id] != subscription {
		registry.mu.Unlock()
		return bridgeError("ERR-014", "MESSAGE_BRIDGE_TIMEOUT", "Message bridge request timed out", true)
	}
	if subscription.inFlight >= registry.eventBufferSize {
		delete(registry.subscriptions, subscription.id)
		registry.mu.Unlock()
		return bridgeError("ERR-014", "MESSAGE_BRIDGE_TIMEOUT", "Message bridge request timed out", true)
	}
	seq := subscription.nextSeq
	subscription.nextSeq++
	subscription.inFlight++
	now := registry.now().UTC()
	if eventType == contracts.LiveTraceEventTypeHeartbeat {
		subscription.lastBeat = now
	}
	registry.mu.Unlock()

	defer registry.completePublish(subscription, now)

	event := contracts.LiveTraceEvent{
		SubscriptionID: subscription.id,
		Type:           eventType,
		Seq:            seq,
		ReceivedAt:     now,
		Trace:          trace,
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return registry.publisher.Publish(subscription.sinkSubject, payload)
}

func (registry *LiveTraceRegistry) completePublish(subscription *liveTraceSubscription, completedAt time.Time) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if subscription.inFlight > 0 {
		subscription.inFlight--
	}
	if registry.subscriptions[subscription.id] == subscription {
		subscription.lastProgress = completedAt
	}
}

func (registry *LiveTraceRegistry) subscriptionStalled(subscription *liveTraceSubscription, now time.Time) bool {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return registry.subscriptions[subscription.id] == subscription &&
		registry.deliveryTimeout > 0 &&
		now.Sub(subscription.lastProgress) >= registry.deliveryTimeout
}

func validateLiveStart(request contracts.LiveTraceStartRequest) error {
	if strings.TrimSpace(request.SubscriptionID) == "" {
		return validationError("subscriptionId is required")
	}
	sinkSubject := strings.TrimSpace(request.SinkSubject)
	if sinkSubject == "" {
		return validationError("sinkSubject is required")
	}
	if !strings.HasPrefix(sinkSubject, "telemetry.traces.live.events.") {
		return validationError("sinkSubject must use telemetry.traces.live.events")
	}
	return nil
}

func validateLiveQuery(query contracts.LiveTraceQuery) error {
	limit := defaultLiveLimit
	if query.Limit != nil {
		limit = *query.Limit
	}
	if limit < 1 || limit > maxLiveLimit {
		return validationError("limit must be between 1 and 500")
	}
	if query.MinDurationMs != nil && *query.MinDurationMs < 0 {
		return validationError("minDurationMs must be greater than or equal to 0")
	}
	if query.MaxDurationMs != nil && *query.MaxDurationMs < 0 {
		return validationError("maxDurationMs must be greater than or equal to 0")
	}
	if query.MinDurationMs != nil && query.MaxDurationMs != nil && *query.MinDurationMs > *query.MaxDurationMs {
		return validationError("minDurationMs must be less than or equal to maxDurationMs")
	}
	return nil
}

func normalizeLiveQuery(query contracts.LiveTraceQuery, now time.Time) contracts.LiveTraceQuery {
	if query.Limit == nil {
		limit := defaultLiveLimit
		query.Limit = &limit
	}
	return query
}

func cleanTraceIDs(traceIDs []string) []string {
	cleaned := make([]string, 0, len(traceIDs))
	seen := map[string]bool{}
	for _, traceID := range traceIDs {
		traceID = strings.TrimSpace(traceID)
		if traceID == "" || seen[traceID] {
			continue
		}
		cleaned = append(cleaned, traceID)
		seen[traceID] = true
	}
	return cleaned
}

func matchesLiveTraceSummary(query contracts.LiveTraceQuery, trace contracts.TraceSummary) bool {
	if query.Service != nil && (trace.ServiceName == nil || *trace.ServiceName != *query.Service) {
		return false
	}
	if query.Status != nil && (trace.Status == nil || *trace.Status != *query.Status) {
		return false
	}
	if query.From != nil && trace.StartedAt.Before(query.From.UTC()) {
		return false
	}
	if query.MinDurationMs != nil && (trace.DurationMs == nil || *trace.DurationMs < *query.MinDurationMs) {
		return false
	}
	if query.MaxDurationMs != nil && (trace.DurationMs == nil || *trace.DurationMs > *query.MaxDurationMs) {
		return false
	}
	if query.Query != nil && strings.TrimSpace(*query.Query) != "" && !traceSummaryContains(trace, *query.Query) {
		return false
	}
	if query.OperationName != nil && strings.TrimSpace(*query.OperationName) != "" && (trace.OperationName == nil || *trace.OperationName != strings.TrimSpace(*query.OperationName)) {
		return false
	}
	for _, filter := range query.Attributes {
		if !matchesAttributeFilter(trace.Attributes, filter) {
			return false
		}
	}
	return true
}

func matchesAttributeFilter(attributes contracts.Attributes, filter contracts.AttributeFilter) bool {
	key := strings.TrimSpace(filter.Key)
	if key == "" {
		return false
	}
	value, exists := attributes[key]
	switch filter.Operator {
	case contracts.AttributeFilterOperatorExists:
		return exists
	case contracts.AttributeFilterOperatorEQ:
		return exists && attributeValuesEqual(value, filter.Value)
	case contracts.AttributeFilterOperatorNEQ:
		return !exists || !attributeValuesEqual(value, filter.Value)
	case contracts.AttributeFilterOperatorContains:
		return exists && strings.Contains(strings.ToLower(fmt.Sprint(value)), strings.ToLower(fmt.Sprint(filter.Value)))
	case contracts.AttributeFilterOperatorIN:
		return exists && attributeValueIn(value, filter.Value)
	case contracts.AttributeFilterOperatorNotIN:
		return !exists || !attributeValueIn(value, filter.Value)
	case contracts.AttributeFilterOperatorGT, contracts.AttributeFilterOperatorGTE, contracts.AttributeFilterOperatorLT, contracts.AttributeFilterOperatorLTE:
		return exists && compareAttributeValue(value, filter.Value, filter.Operator)
	default:
		return false
	}
}

func attributeValuesEqual(left any, right any) bool {
	return reflect.DeepEqual(left, right) || fmt.Sprint(left) == fmt.Sprint(right)
}

func attributeValueIn(value any, candidates any) bool {
	switch typed := candidates.(type) {
	case []any:
		for _, candidate := range typed {
			if attributeValuesEqual(value, candidate) {
				return true
			}
		}
		return false
	case []string:
		return slices.Contains(typed, fmt.Sprint(value))
	default:
		return attributeValuesEqual(value, candidates)
	}
}

func compareAttributeValue(left any, right any, operator contracts.AttributeFilterOperator) bool {
	leftNumber, leftOK := numberValue(left)
	rightNumber, rightOK := numberValue(right)
	if !leftOK || !rightOK {
		return false
	}
	switch operator {
	case contracts.AttributeFilterOperatorGT:
		return leftNumber > rightNumber
	case contracts.AttributeFilterOperatorGTE:
		return leftNumber >= rightNumber
	case contracts.AttributeFilterOperatorLT:
		return leftNumber < rightNumber
	case contracts.AttributeFilterOperatorLTE:
		return leftNumber <= rightNumber
	default:
		return false
	}
}

func numberValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	default:
		return 0, false
	}
}

func traceSummaryContains(trace contracts.TraceSummary, query string) bool {
	query = strings.ToLower(strings.TrimSpace(query))
	if strings.Contains(strings.ToLower(trace.ID), query) {
		return true
	}
	if trace.ServiceName != nil && strings.Contains(strings.ToLower(*trace.ServiceName), query) {
		return true
	}
	if trace.RootSpanID != nil && strings.Contains(strings.ToLower(*trace.RootSpanID), query) {
		return true
	}
	if trace.OperationName != nil && strings.Contains(strings.ToLower(*trace.OperationName), query) {
		return true
	}
	for key, value := range trace.Attributes {
		if strings.Contains(strings.ToLower(key), query) || strings.Contains(strings.ToLower(strings.TrimSpace(jsonScalar(value))), query) {
			return true
		}
	}
	return false
}

func jsonScalar(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}
