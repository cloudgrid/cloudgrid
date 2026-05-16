package internal

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
)

const (
	SubjectEvalAgentRunsSearch    = "eval.agent_runs.search"
	SubjectEvalDatasetSearch      = "eval.dataset.search"
	SubjectEvalDatasetHealth      = "eval.dataset.health"
	SubjectEvalScorerSearch       = "eval.scorer.search"
	SubjectEvalExperimentSearch   = "eval.experiment.search"
	SubjectEvalResultsSearch      = "eval.results.search"
	SubjectEvalManifestResolve    = "eval.manifest.resolve"
	SubjectEvalQualityOverview    = "eval.quality.overview"
	SubjectEvalLiveStart          = "eval.live.start"
	SubjectEvalLiveStop           = "eval.live.stop"
	SubjectEvalExperimentProgress = "eval.experiment.progress"
	SubjectAnnotationQueueSearch  = "annotation.queue.search"

	defaultEvalLiveHeartbeatInterval = 15 * time.Second
	defaultMaxEvalLiveSubscriptions  = 500
)

type AiEvalQueryStore = ports.AiEvalReadStore

type EvalLivePublisher interface {
	Publish(subject string, data []byte) error
}

type EvalLiveOptions struct {
	HeartbeatInterval time.Duration
	MaxSubscriptions  int
	Now               func() time.Time
}

type EvalLiveRegistry struct {
	store             AiEvalQueryStore
	publisher         EvalLivePublisher
	heartbeatInterval time.Duration
	maxSubscriptions  int
	now               func() time.Time

	mu            sync.Mutex
	subscriptions map[string]*evalLiveSubscription
}

type evalLiveSubscription struct {
	id              string
	experimentRunID string
	sinkSubject     string
	createdAt       time.Time
	lastBeat        time.Time
	nextSeq         int
}

func NewEvalLiveRegistry(store AiEvalQueryStore, publisher EvalLivePublisher, options EvalLiveOptions) *EvalLiveRegistry {
	heartbeatInterval := options.HeartbeatInterval
	if heartbeatInterval <= 0 {
		heartbeatInterval = defaultEvalLiveHeartbeatInterval
	}
	maxSubscriptions := options.MaxSubscriptions
	if maxSubscriptions <= 0 {
		maxSubscriptions = defaultMaxEvalLiveSubscriptions
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	return &EvalLiveRegistry{
		store:             store,
		publisher:         publisher,
		heartbeatInterval: heartbeatInterval,
		maxSubscriptions:  maxSubscriptions,
		now:               now,
		subscriptions:     map[string]*evalLiveSubscription{},
	}
}

func (registry *EvalLiveRegistry) Count() int {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return len(registry.subscriptions)
}

func (registry *EvalLiveRegistry) Start(request contracts.EvalLiveStartRequest) (contracts.EvalLiveStartData, error) {
	if err := validateEvalLiveStart(request); err != nil {
		return contracts.EvalLiveStartData{}, err
	}
	now := registry.now().UTC()
	subscription := &evalLiveSubscription{
		id:              request.SubscriptionID,
		experimentRunID: request.ExperimentRunID,
		sinkSubject:     request.SinkSubject,
		createdAt:       now,
		lastBeat:        now,
		nextSeq:         1,
	}

	registry.mu.Lock()
	if _, exists := registry.subscriptions[request.SubscriptionID]; !exists && len(registry.subscriptions) >= registry.maxSubscriptions {
		registry.mu.Unlock()
		return contracts.EvalLiveStartData{}, bridgeError("ERR-017", "SUBSCRIPTION_LIMIT_EXCEEDED", "Too many live telemetry subscriptions are open", true)
	}
	registry.subscriptions[request.SubscriptionID] = subscription
	registry.mu.Unlock()

	if err := registry.publish(subscription, "heartbeat", nil, nil); err != nil {
		registry.remove(request.SubscriptionID)
		return contracts.EvalLiveStartData{}, bridgeError("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "Message bridge is unavailable", true)
	}

	return contracts.EvalLiveStartData{
		SubscriptionID:      request.SubscriptionID,
		HeartbeatIntervalMs: int(registry.heartbeatInterval / time.Millisecond),
	}, nil
}

func (registry *EvalLiveRegistry) Stop(request contracts.EvalLiveStopRequest) (contracts.EvalLiveStopData, error) {
	if strings.TrimSpace(request.SubscriptionID) == "" {
		return contracts.EvalLiveStopData{}, validationError("subscriptionId is required")
	}
	registry.remove(request.SubscriptionID)
	return contracts.EvalLiveStopData{SubscriptionID: request.SubscriptionID}, nil
}

func (registry *EvalLiveRegistry) HandleProgress(ctx context.Context, notification contracts.ExperimentProgressNotification) error {
	if strings.TrimSpace(notification.ExperimentRunID) == "" {
		return validationError("experimentRunId is required")
	}
	if strings.TrimSpace(notification.Type) == "" {
		return validationError("type is required")
	}
	subscriptions := registry.matchingSubscriptions(notification.ExperimentRunID)
	if len(subscriptions) == 0 {
		return nil
	}
	run, itemRun, err := registry.store.GetExperimentRunEventData(ctx, notification)
	if err != nil {
		return err
	}
	for _, subscription := range subscriptions {
		if err := registry.publish(subscription, notification.Type, run, itemRun); err != nil {
			registry.remove(subscription.id)
		}
	}
	return nil
}

func (registry *EvalLiveRegistry) matchingSubscriptions(experimentRunID string) []*evalLiveSubscription {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	subscriptions := make([]*evalLiveSubscription, 0, len(registry.subscriptions))
	for _, subscription := range registry.subscriptions {
		if subscription.experimentRunID == experimentRunID {
			subscriptions = append(subscriptions, subscription)
		}
	}
	return subscriptions
}

func (registry *EvalLiveRegistry) remove(subscriptionID string) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	delete(registry.subscriptions, subscriptionID)
}

func (registry *EvalLiveRegistry) publish(subscription *evalLiveSubscription, eventType string, run map[string]any, itemRun map[string]any) error {
	registry.mu.Lock()
	seq := subscription.nextSeq
	subscription.nextSeq++
	now := registry.now().UTC()
	if eventType == "heartbeat" {
		subscription.lastBeat = now
	}
	registry.mu.Unlock()

	experimentRunID := subscription.experimentRunID
	event := contracts.ExperimentRunEvent{
		Type:            eventType,
		Seq:             seq,
		ReceivedAt:      now,
		ExperimentRunID: &experimentRunID,
		Run:             run,
		ItemRun:         itemRun,
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return registry.publisher.Publish(subscription.sinkSubject, payload)
}

func validateEvalLiveStart(request contracts.EvalLiveStartRequest) error {
	if strings.TrimSpace(request.SubscriptionID) == "" {
		return validationError("subscriptionId is required")
	}
	if strings.TrimSpace(request.ExperimentRunID) == "" {
		return validationError("experimentRunId is required")
	}
	sinkSubject := strings.TrimSpace(request.SinkSubject)
	if sinkSubject == "" {
		return validationError("sinkSubject is required")
	}
	if !strings.HasPrefix(sinkSubject, "eval.live.events.") {
		return validationError("sinkSubject must use eval.live.events")
	}
	return nil
}

func aiEvalReadSubjectHandlers(store AiEvalQueryStore, registry *EvalLiveRegistry, logger *slog.Logger) map[string]bridgeMessageHandler {
	queryHandler := handleAiEvalQuery(store, logger)
	return map[string]bridgeMessageHandler{
		SubjectEvalAgentRunsSearch:    queryHandler,
		SubjectEvalDatasetSearch:      queryHandler,
		SubjectEvalDatasetHealth:      queryHandler,
		SubjectEvalScorerSearch:       queryHandler,
		SubjectEvalExperimentSearch:   queryHandler,
		SubjectEvalResultsSearch:      queryHandler,
		SubjectEvalQualityOverview:    queryHandler,
		SubjectEvalManifestResolve:    handleExperimentManifestResolve(store, logger),
		SubjectAnnotationQueueSearch:  queryHandler,
		SubjectEvalLiveStart:          handleEvalLiveStart(registry, logger),
		SubjectEvalLiveStop:           handleEvalLiveStop(registry, logger),
		SubjectEvalExperimentProgress: handleExperimentProgressNotification(registry, logger),
	}
}

func handleAiEvalQuery(store AiEvalQueryStore, logger *slog.Logger) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.EvalQueryRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.EvalQueryResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid AI eval query request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		defer cancel()
		data, err := store.QueryAiEval(ctx, msg.Subject(), request.Input)
		if err != nil {
			response := contracts.EvalQueryResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.EvalQueryResponse{RequestID: request.RequestID, OK: true, Data: data}
		respond(msg, response)
		logHandlerCompletion(logger, msg.Subject(), request.RequestID, true, start, nil)
	}
}

func handleExperimentManifestResolve(store AiEvalQueryStore, logger *slog.Logger) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.ExperimentManifestResolveRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.ExperimentManifestResolveResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid experiment manifest resolve request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalManifestResolve, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		defer cancel()
		manifest, err := store.ResolveExperimentManifest(ctx, request)
		if err != nil {
			response := contracts.ExperimentManifestResolveResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalManifestResolve, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.ExperimentManifestResolveResponse{
			RequestID: request.RequestID,
			OK:        true,
			Data:      map[string]any{"manifest": manifest},
		}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectEvalManifestResolve, request.RequestID, true, start, nil)
	}
}

func handleEvalLiveStart(registry *EvalLiveRegistry, logger *slog.Logger) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.EvalLiveStartRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.EvalLiveStartResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid eval live start request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalLiveStart, response.RequestID, false, start, response.Error)
			return
		}
		data, err := registry.Start(request)
		if err != nil {
			response := contracts.EvalLiveStartResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalLiveStart, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.EvalLiveStartResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectEvalLiveStart, request.RequestID, true, start, nil)
	}
}

func handleEvalLiveStop(registry *EvalLiveRegistry, logger *slog.Logger) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.EvalLiveStopRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.EvalLiveStopResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid eval live stop request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalLiveStop, response.RequestID, false, start, response.Error)
			return
		}
		data, err := registry.Stop(request)
		if err != nil {
			response := contracts.EvalLiveStopResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalLiveStop, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.EvalLiveStopResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectEvalLiveStop, request.RequestID, true, start, nil)
	}
}

func handleExperimentProgressNotification(registry *EvalLiveRegistry, logger *slog.Logger) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var notification contracts.ExperimentProgressNotification
		if err := json.Unmarshal(msg.Data(), &notification); err != nil {
			logHandlerCompletion(logger, SubjectEvalExperimentProgress, "", false, start, ptr(bridgeErrorFromError(validationError("invalid experiment progress notification JSON"))))
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		defer cancel()
		if err := registry.HandleProgress(ctx, notification); err != nil {
			bridgeError := bridgeErrorFromError(err)
			logHandlerCompletion(logger, SubjectEvalExperimentProgress, notification.RequestID, false, start, &bridgeError)
			return
		}
		logHandlerCompletion(logger, SubjectEvalExperimentProgress, notification.RequestID, true, start, nil)
	}
}
