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
	SubjectEvalAgentRunsSearch            = "eval.agent_runs.search"
	SubjectEvalDatasetSearch              = "eval.dataset.search"
	SubjectEvalDatasetCandidatesSearch    = "eval.dataset.candidates.search"
	SubjectEvalDatasetVersionGet          = "eval.dataset.version.get"
	SubjectEvalDatasetHealth              = "eval.dataset.health"
	SubjectEvalScorerSearch               = "eval.scorer.search"
	SubjectEvalExperimentSearch           = "eval.experiment.search"
	SubjectEvalEvaluationSearch           = "eval.evaluation.search"
	SubjectEvalEvaluationRunSearch        = "eval.evaluation.run.search"
	SubjectEvalEvaluationRunGet           = "eval.evaluation.run.get"
	SubjectEvalResultsSearch              = "eval.results.search"
	SubjectEvalEvaluationComparisonSearch = "eval.evaluation.comparison.search"
	SubjectEvalTargetSnapshotGet          = "eval.target.snapshot.get"
	SubjectEvalTargetDiff                 = "eval.target.diff"
	SubjectEvalOptimizationSearch         = "eval.optimization.search"
	SubjectEvalOptimizationGet            = "eval.optimization.get"
	SubjectEvalManifestResolve            = "eval.manifest.resolve"
	SubjectEvalOnlinePolicyMatchesResolve = "eval.online.policy_matches.resolve"
	SubjectEvalQualityOverview            = "eval.quality.overview"
	SubjectEvalLiveStart                  = "eval.live.start"
	SubjectEvalLiveStop                   = "eval.live.stop"
	SubjectEvalExperimentProgress         = "eval.experiment.progress"
	SubjectAnnotationQueueSearch          = "annotation.queue.search"

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

func aiEvalReadSubjectHandlers(store AiEvalQueryStore, registry *EvalLiveRegistry, logger *slog.Logger, timeout time.Duration) map[string]bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	queryHandler := handleAiEvalQuery(store, logger, timeout)
	return map[string]bridgeMessageHandler{
		SubjectEvalAgentRunsSearch:            queryHandler,
		SubjectEvalDatasetSearch:              queryHandler,
		SubjectEvalDatasetCandidatesSearch:    handleDatasetCandidatesSearch(store, logger, timeout),
		SubjectEvalDatasetTransferGet:         queryHandler,
		SubjectEvalDatasetVersionGet:          queryHandler,
		SubjectEvalDatasetHealth:              queryHandler,
		SubjectEvalScorerSearch:               queryHandler,
		SubjectEvalExperimentSearch:           queryHandler,
		SubjectEvalEvaluationSearch:           queryHandler,
		SubjectEvalEvaluationRunSearch:        queryHandler,
		SubjectEvalEvaluationRunGet:           queryHandler,
		SubjectEvalResultsSearch:              queryHandler,
		SubjectEvalEvaluationComparisonSearch: queryHandler,
		SubjectEvalTargetSnapshotGet:          queryHandler,
		SubjectEvalTargetDiff:                 queryHandler,
		SubjectEvalOptimizationSearch:         queryHandler,
		SubjectEvalOptimizationGet:            queryHandler,
		SubjectEvalQualityOverview:            queryHandler,
		SubjectEvalDatasetExportStart:         handleAiEvalMutationQuery(store, logger, timeout),
		SubjectEvalManifestResolve:            handleExperimentManifestResolve(store, logger, timeout),
		SubjectEvalOnlinePolicyMatchesResolve: handleOnlinePolicyMatchesResolve(store, logger, timeout),
		SubjectAnnotationQueueSearch:          queryHandler,
		SubjectEvalLiveStart:                  handleEvalLiveStart(registry, logger),
		SubjectEvalLiveStop:                   handleEvalLiveStop(registry, logger),
		SubjectEvalExperimentProgress:         handleExperimentProgressNotification(registry, logger, timeout),
	}
}

func handleAiEvalMutationQuery(store AiEvalQueryStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.EvalMutationRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.EvalMutationResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid AI eval mutation request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(msg, timeout)
		defer cancel()
		data, err := store.QueryAiEval(ctx, msg.Subject(), request.Input, request.AuthContext)
		if err != nil {
			response := contracts.EvalMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: data}
		respond(msg, response)
		logHandlerCompletion(logger, msg.Subject(), request.RequestID, true, start, nil)
	}
}

func handleAiEvalQuery(store AiEvalQueryStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.EvalQueryRequest
		var raw map[string]any
		if err := json.Unmarshal(msg.Data(), &raw); err != nil {
			response := contracts.EvalQueryResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid AI eval query request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		if data, err := json.Marshal(raw); err != nil || json.Unmarshal(data, &request) != nil {
			response := contracts.EvalQueryResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid AI eval query request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(msg, timeout)
		defer cancel()
		input := aiEvalQueryInputFromRequest(raw, request.Input)
		data, err := store.QueryAiEval(ctx, msg.Subject(), input, request.AuthContext)
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

func aiEvalQueryInputFromRequest(raw map[string]any, nested map[string]any) map[string]any {
	input := map[string]any{}
	for key, value := range nested {
		input[key] = value
	}
	for key, value := range raw {
		switch key {
		case "requestId", "issuedAt", "authContext", "traceContext", "input":
			continue
		default:
			if _, exists := input[key]; !exists {
				input[key] = value
			}
		}
	}
	return input
}

func handleDatasetCandidatesSearch(store AiEvalQueryStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.DatasetCandidatesSearchRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.EvalQueryResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid dataset candidates search request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, msg.Subject(), response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(msg, timeout)
		defer cancel()
		data, err := store.QueryAiEval(ctx, SubjectEvalDatasetCandidatesSearch, datasetCandidatesSearchInput(request), request.AuthContext)
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

func datasetCandidatesSearchInput(request contracts.DatasetCandidatesSearchRequest) map[string]any {
	input := map[string]any{}
	setOptionalString := func(key string, value *string) {
		if value != nil && strings.TrimSpace(*value) != "" {
			input[key] = strings.TrimSpace(*value)
		}
	}
	setOptionalString("datasetId", request.DatasetID)
	setOptionalString("status", request.Status)
	setOptionalString("sourceKind", request.SourceKind)
	setOptionalString("targetShape", request.TargetShape)
	setOptionalString("contentTreatment", request.ContentTreatment)
	setOptionalString("clusterId", request.ClusterID)
	setOptionalString("query", request.Query)
	setOptionalString("cursor", request.Cursor)
	if request.Limit != nil {
		input["limit"] = *request.Limit
	}
	return input
}

func handleExperimentManifestResolve(store AiEvalQueryStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
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
		ctx, cancel := readHandlerContext(msg, timeout)
		defer cancel()
		manifest, err := store.ResolveExperimentManifest(ctx, request)
		if err != nil {
			response := contracts.ExperimentManifestResolveResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalManifestResolve, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.ExperimentManifestResolveResponse{RequestID: request.RequestID, OK: true}
		if typed, err := mapToExperimentManifest(manifest); err == nil {
			response.Data = &contracts.ExperimentManifestData{Manifest: typed}
		} else {
			response.OK = false
			response.Error = ptr(bridgeErrorFromError(err))
		}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectEvalManifestResolve, request.RequestID, response.OK, start, response.Error)
	}
}

func handleOnlinePolicyMatchesResolve(store AiEvalQueryStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.OnlinePolicyMatchesResolveRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.OnlinePolicyMatchesResolveResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid online policy resolve request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalOnlinePolicyMatchesResolve, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(msg, timeout)
		defer cancel()
		data, err := store.ResolveOnlinePolicyMatches(ctx, request)
		if err != nil {
			response := contracts.OnlinePolicyMatchesResolveResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectEvalOnlinePolicyMatchesResolve, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.OnlinePolicyMatchesResolveResponse{
			RequestID: request.RequestID,
			OK:        true,
			Data:      &data,
		}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectEvalOnlinePolicyMatchesResolve, request.RequestID, true, start, nil)
	}
}

func mapToExperimentManifest(value map[string]any) (contracts.ExperimentManifest, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return contracts.ExperimentManifest{}, err
	}
	var manifest contracts.ExperimentManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return contracts.ExperimentManifest{}, validationError("experiment manifest did not match contract")
	}
	return manifest, nil
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

func handleExperimentProgressNotification(registry *EvalLiveRegistry, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var notification contracts.ExperimentProgressNotification
		if err := json.Unmarshal(msg.Data(), &notification); err != nil {
			logHandlerCompletion(logger, SubjectEvalExperimentProgress, "", false, start, ptr(bridgeErrorFromError(validationError("invalid experiment progress notification JSON"))))
			return
		}
		ctx, cancel := readHandlerContext(msg, timeout)
		defer cancel()
		if err := registry.HandleProgress(ctx, notification); err != nil {
			bridgeError := bridgeErrorFromError(err)
			logHandlerCompletion(logger, SubjectEvalExperimentProgress, notification.RequestID, false, start, &bridgeError)
			return
		}
		logHandlerCompletion(logger, SubjectEvalExperimentProgress, notification.RequestID, true, start, nil)
	}
}
