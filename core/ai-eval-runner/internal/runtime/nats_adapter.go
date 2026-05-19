package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/orchestrator"
	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/nats-io/nats.go"
)

func ConnectNATS(url string) (*nats.Conn, error) {
	conn, err := nats.Connect(url, nats.Name("cloudgrid-ai-eval-runner"))
	if err != nil {
		return nil, fmt.Errorf("%s %s: NATS connection failed", messageBridgeErrorID, messageBridgeErrorCode)
	}
	return conn, nil
}

func SubscribeRunnerHandlers(nc *nats.Conn, runner *orchestrator.Runner, logger *slog.Logger) ([]*nats.Subscription, error) {
	return SubscribeRunnerHandlersWithOptions(nc, runner, logger, RunnerServiceOptions{})
}

func SubscribeRunnerHandlersWithOptions(nc *nats.Conn, runner *orchestrator.Runner, logger *slog.Logger, options RunnerServiceOptions) ([]*nats.Subscription, error) {
	service := NewRunnerServiceWithOptions(runner, logger, options)
	subscriptions := make([]*nats.Subscription, 0, len(service.SubjectHandlers()))
	for subject, handler := range service.SubjectHandlers() {
		subscription, err := nc.Subscribe(subject, adaptNATSHandler(handler))
		if err != nil {
			return nil, fmt.Errorf("%s %s: NATS subscribe failed", messageBridgeErrorID, messageBridgeErrorCode)
		}
		subscriptions = append(subscriptions, subscription)
	}
	if err := nc.Flush(); err != nil {
		return nil, fmt.Errorf("%s %s: NATS subscription flush failed", messageBridgeErrorID, messageBridgeErrorCode)
	}
	return subscriptions, nil
}

type natsBridgeMessage struct {
	msg *nats.Msg
}

func (message natsBridgeMessage) Subject() string {
	return message.msg.Subject
}

func (message natsBridgeMessage) Data() []byte {
	return message.msg.Data
}

func (message natsBridgeMessage) Respond(response []byte) error {
	return message.msg.Respond(response)
}

func adaptNATSHandler(handler Handler) nats.MsgHandler {
	return func(msg *nats.Msg) {
		handler(natsBridgeMessage{msg: msg})
	}
}

type NATSRequester struct {
	Conn    *nats.Conn
	Timeout time.Duration
}

type authContextKey struct{}

func contextWithAuth(authContext *contracts.AuthContext) context.Context {
	if authContext == nil {
		return context.Background()
	}
	return context.WithValue(context.Background(), authContextKey{}, authContext)
}

func runnerEnvelope(ctx context.Context, requestID string) contracts.BridgeEnvelope {
	envelope := contracts.BridgeEnvelope{RequestID: requestID, IssuedAt: time.Now().UTC()}
	if authContext, ok := ctx.Value(authContextKey{}).(*contracts.AuthContext); ok {
		envelope.AuthContext = authContext
	}
	return envelope
}

func (requester NATSRequester) RequestWithContext(ctx context.Context, subject string, data []byte) (*Message, error) {
	msg, err := requester.Conn.RequestWithContext(ctx, subject, data)
	if err != nil {
		return nil, fmt.Errorf("%s %s: request %s failed", messageBridgeErrorID, messageBridgeErrorCode, subject)
	}
	return &Message{Data: msg.Data}, nil
}

func (requester NATSRequester) Publish(subject string, data []byte) error {
	if err := requester.Conn.Publish(subject, data); err != nil {
		return fmt.Errorf("%s %s: publish %s failed", messageBridgeErrorID, messageBridgeErrorCode, subject)
	}
	return nil
}

type NATSStorageReader struct {
	Requester Requester
	Timeout   time.Duration
}

func (reader NATSStorageReader) SearchExperiments(ctx context.Context, experimentID string) ([]ports.Experiment, error) {
	data, err := reader.evalQuery(ctx, SubjectExperimentSearch, map[string]any{"id": experimentID})
	if err != nil {
		return nil, err
	}
	items, _ := data["items"].([]any)
	experiments := make([]ports.Experiment, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			experiments = append(experiments, ports.Experiment{
				ID:             stringValue(row, "id"),
				DatasetID:      stringValue(row, "datasetId"),
				DatasetVersion: intValue(row, "datasetVersion"),
				ScorerIDs:      stringArrayValue(row, "scorerIds"),
			})
		}
	}
	return experiments, nil
}

func (reader NATSStorageReader) SearchDatasetItems(ctx context.Context, datasetID string, datasetVersion int) ([]ports.DatasetItem, error) {
	data, err := reader.evalQuery(ctx, SubjectDatasetSearch, map[string]any{"datasetId": datasetID, "datasetVersion": datasetVersion})
	if err != nil {
		return nil, err
	}
	items, _ := data["items"].([]any)
	result := make([]ports.DatasetItem, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			result = append(result, ports.DatasetItem{
				ID:       stringValue(row, "id"),
				Input:    objectValue(row, "input"),
				Expected: objectValue(row, "expected"),
			})
		}
	}
	return result, nil
}

func (reader NATSStorageReader) SearchScorers(ctx context.Context, scorerIDs []string) ([]ports.Scorer, error) {
	data, err := reader.evalQuery(ctx, SubjectScorerSearch, map[string]any{"scorerIds": scorerIDs})
	if err != nil {
		return nil, err
	}
	items, _ := data["items"].([]any)
	result := make([]ports.Scorer, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			result = append(result, ports.Scorer{
				ID:         stringValue(row, "id"),
				Kind:       stringValue(row, "kind"),
				Definition: objectValue(row, "definition"),
				Version:    intValue(row, "version"),
			})
		}
	}
	return result, nil
}

func (reader NATSStorageReader) ResolveManifest(ctx context.Context, request ports.ManifestResolveRequest) (ports.ExperimentManifest, error) {
	resolveRequest := contracts.ExperimentManifestResolveRequest{
		BridgeEnvelope:  runnerEnvelope(ctx, request.ExperimentRunID+":manifest"),
		ExperimentRunID: request.ExperimentRunID,
		ExperimentID:    request.ExperimentID,
		SplitSelector:   splitSelectorMap(request.SplitSelector),
	}
	if request.OptimizerKind != "" {
		resolveRequest.OptimizerKind = &request.OptimizerKind
	}
	responseData, err := requestJSON(ctx, reader.Requester, reader.timeout(), SubjectManifestResolve, resolveRequest)
	if err != nil {
		return ports.ExperimentManifest{}, err
	}
	var response contracts.ExperimentManifestResolveResponse
	if err := decodeStrict(responseData, &response); err != nil {
		return ports.ExperimentManifest{}, err
	}
	if !response.OK {
		return ports.ExperimentManifest{}, errorFromBridge(response.Error)
	}
	manifest, _ := response.Data["manifest"].(map[string]any)
	return manifestFromMap(manifest), nil
}

func (reader NATSStorageReader) ResolveOnlinePolicyMatches(ctx context.Context, request ports.OnlinePolicyResolveRequest) (ports.OnlinePolicyMatches, error) {
	kinds := make([]contracts.AiProjectionKind, 0, len(request.Kinds))
	for _, kind := range request.Kinds {
		kinds = append(kinds, contracts.AiProjectionKind(kind))
	}
	persistedAt, err := time.Parse(time.RFC3339Nano, request.PersistedAt)
	if err != nil {
		return ports.OnlinePolicyMatches{}, err
	}
	resolveRequest := contracts.OnlinePolicyMatchesResolveRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: request.RequestID, IssuedAt: time.Now().UTC()},
		ProjectID:      request.ProjectID,
		TraceID:        request.TraceID,
		ProjectionIDs:  append([]string(nil), request.ProjectionIDs...),
		SpanIDs:        append([]string(nil), request.SpanIDs...),
		Kinds:          kinds,
		PersistedAt:    persistedAt.UTC(),
	}
	responseData, err := requestJSON(ctx, reader.Requester, reader.timeout(), SubjectOnlinePolicyResolve, resolveRequest)
	if err != nil {
		return ports.OnlinePolicyMatches{}, err
	}
	var response contracts.OnlinePolicyMatchesResolveResponse
	if err := decodeStrict(responseData, &response); err != nil {
		return ports.OnlinePolicyMatches{}, err
	}
	if !response.OK {
		return ports.OnlinePolicyMatches{}, errorFromBridge(response.Error)
	}
	if response.Data == nil {
		return ports.OnlinePolicyMatches{}, nil
	}
	matches := make([]ports.OnlinePolicyMatch, 0, len(response.Data.Matches))
	for _, match := range response.Data.Matches {
		scorerRefs := make([]ports.OnlinePolicyScorerRef, 0, len(match.ScorerRefs))
		for _, ref := range match.ScorerRefs {
			scorerRefs = append(scorerRefs, ports.OnlinePolicyScorerRef{
				ScorerID:      ref.ScorerID,
				ScorerVersion: ref.ScorerVersion,
				Kind:          ref.Kind,
			})
		}
		maxDailyRuns := 0
		if match.MaxDailyRuns != nil {
			maxDailyRuns = *match.MaxDailyRuns
		}
		matches = append(matches, ports.OnlinePolicyMatch{
			PolicyID:      match.PolicyID,
			PolicyVersion: match.PolicyVersion,
			PolicyName:    match.PolicyName,
			Target:        onlinePolicyTargetMap(match.Target),
			SampleRate:    match.SampleRate,
			MaxDailyRuns:  maxDailyRuns,
			ScorerRefs:    scorerRefs,
			Projection: ports.OnlinePolicyProjection{
				ProjectID:       match.Projection.ProjectID,
				TraceID:         match.Projection.TraceID,
				SpanID:          stringPtrValue(match.Projection.SpanID),
				ProjectionID:    match.Projection.ProjectionID,
				Kind:            string(match.Projection.Kind),
				AgentID:         stringPtrValue(match.Projection.AgentID),
				AgentName:       stringPtrValue(match.Projection.AgentName),
				Environment:     stringPtrValue(match.Projection.Environment),
				ServiceName:     stringPtrValue(match.Projection.ServiceName),
				Route:           stringPtrValue(match.Projection.Route),
				ToolName:        stringPtrValue(match.Projection.ToolName),
				RetrievalSource: stringPtrValue(match.Projection.RetrievalSource),
				Model:           stringPtrValue(match.Projection.Model),
				PromptVersionID: stringPtrValue(match.Projection.PromptVersionID),
				ExperimentRunID: stringPtrValue(match.Projection.ExperimentRunID),
				SafeAttributes:  match.Projection.SafeAttributes,
			},
		})
	}
	return ports.OnlinePolicyMatches{Matches: matches, Warnings: append([]string(nil), response.Data.Warnings...)}, nil
}

func (reader NATSStorageReader) evalQuery(ctx context.Context, subject string, input map[string]any) (map[string]any, error) {
	request := contracts.EvalQueryRequest{
		BridgeEnvelope: runnerEnvelope(ctx, subject+":runner"),
		Input:          input,
	}
	responseData, err := requestJSON(ctx, reader.Requester, reader.timeout(), subject, request)
	if err != nil {
		return nil, err
	}
	var response contracts.EvalQueryResponse
	if err := decodeStrict(responseData, &response); err != nil {
		return nil, err
	}
	if !response.OK {
		return nil, errorFromBridge(response.Error)
	}
	return response.Data, nil
}

func (reader NATSStorageReader) timeout() time.Duration {
	if reader.Timeout > 0 {
		return reader.Timeout
	}
	return defaultRequestTimeout
}

type NATSControlPlane struct {
	Requester Requester
	Timeout   time.Duration
}

func (control NATSControlPlane) GetProjectAISettings(ctx context.Context, projectID string) (ports.ProjectAISettings, error) {
	request := contracts.ProjectAiSettingsGetRequest{
		BridgeEnvelope: runnerEnvelope(ctx, projectID+":ai-settings"),
		ProjectID:      projectID,
	}
	responseData, err := requestJSON(ctx, control.Requester, control.timeout(), SubjectControlAISettingsGet, request)
	if err != nil {
		return ports.ProjectAISettings{}, err
	}
	var response contracts.ProjectAiSettingsGetResponse
	if err := decodeStrict(responseData, &response); err != nil {
		return ports.ProjectAISettings{}, err
	}
	if !response.OK {
		return ports.ProjectAISettings{}, errorFromBridge(response.Error)
	}
	settings, _ := response.Data["settings"].(map[string]any)
	return ports.ProjectAISettings{ProjectID: stringValue(settings, "projectId"), Budget: objectValue(settings, "budget")}, nil
}

func (control NATSControlPlane) timeout() time.Duration {
	if control.Timeout > 0 {
		return control.Timeout
	}
	return defaultRequestTimeout
}

type NATSStorageWriter struct {
	Requester Requester
	Timeout   time.Duration
}

func (writer NATSStorageWriter) PersistExperimentRun(ctx context.Context, run ports.ExperimentRun) error {
	_, err := writer.evalMutation(ctx, SubjectResultsPersist, map[string]any{
		"experimentRunId": run.ID,
		"results":         []any{experimentRunData(run)},
	})
	return err
}

func (writer NATSStorageWriter) PersistDatasetItemRun(ctx context.Context, idempotencyKey string, run ports.DatasetItemRun) error {
	_, err := writer.evalMutation(ctx, SubjectResultsPersist, map[string]any{
		"experimentRunId": run.ExperimentRunID,
		"itemRuns": []any{map[string]any{
			"id":              run.ID,
			"idempotencyKey":  idempotencyKey,
			"experimentRunId": run.ExperimentRunID,
			"datasetItemId":   run.DatasetItemID,
			"harnessRunId":    run.HarnessRunID,
			"output":          run.Output,
			"latencyMs":       run.LatencyMs,
		}},
	})
	return err
}

func (writer NATSStorageWriter) PersistEvalResult(ctx context.Context, idempotencyKey string, result ports.EvalResult) error {
	input := map[string]any{
		"results": []any{map[string]any{
			"id":              result.ID,
			"idempotencyKey":  idempotencyKey,
			"scorerId":        result.ScorerID,
			"scorerVersion":   result.ScorerVersion,
			"targetKind":      result.TargetKind,
			"targetId":        result.TargetID,
			"experimentRunId": result.ExperimentRunID,
			"score":           result.Score,
			"passed":          result.Passed,
			"evidence":        result.Evidence,
			"judgeRunRef":     result.JudgeRunRef,
			"producedAt":      result.ProducedAt,
		}},
	}
	if result.ExperimentRunID != "" {
		input["experimentRunId"] = result.ExperimentRunID
	}
	_, err := writer.evalMutation(ctx, SubjectResultsPersist, input)
	return err
}

func (writer NATSStorageWriter) UpdateExperimentProgress(ctx context.Context, progress ports.ExperimentProgress) error {
	_, _ = ctx, progress
	return nil
}

func (writer NATSStorageWriter) evalMutation(ctx context.Context, subject string, input map[string]any) (map[string]any, error) {
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: runnerEnvelope(ctx, subject+":runner"),
		Input:          input,
	}
	responseData, err := requestJSON(ctx, writer.Requester, writer.timeout(), subject, request)
	if err != nil {
		return nil, err
	}
	var response contracts.EvalMutationResponse
	if err := decodeStrict(responseData, &response); err != nil {
		return nil, err
	}
	if !response.OK {
		return nil, errorFromBridge(response.Error)
	}
	return response.Data, nil
}

func (writer NATSStorageWriter) timeout() time.Duration {
	if writer.Timeout > 0 {
		return writer.Timeout
	}
	return defaultRequestTimeout
}

type NATSProgressPublisher struct {
	Publisher Requester
}

func (publisher NATSProgressPublisher) PublishExperimentProgress(ctx context.Context, progress ports.ExperimentProgress) error {
	_ = ctx
	notification := contracts.ExperimentProgressNotification{
		RequestID:       progress.ExperimentRunID + ":" + progress.Type,
		ExperimentRunID: progress.ExperimentRunID,
		Type:            progress.Type,
		OccurredAt:      timeNowUTC(progress.OccurredAt),
	}
	if progress.DatasetItemRunID != "" {
		notification.DatasetItemRunID = &progress.DatasetItemRunID
	}
	payload, err := marshalJSON(notification)
	if err != nil {
		return err
	}
	return publisher.Publisher.Publish(SubjectExperimentProgress, payload)
}

func requestJSON(ctx context.Context, requester Requester, timeout time.Duration, subject string, request any) ([]byte, error) {
	payload, err := marshalJSON(request)
	if err != nil {
		return nil, err
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	response, err := requester.RequestWithContext(requestCtx, subject, payload)
	if err != nil {
		return nil, err
	}
	return response.Data, nil
}

func splitSelectorMap(selector ports.DatasetSplitSelector) map[string]any {
	if len(selector.Splits) == 0 && !selector.ReviewedOnly && !selector.IncludeSynthetic {
		return nil
	}
	return map[string]any{
		"splits":           selector.Splits,
		"reviewedOnly":     selector.ReviewedOnly,
		"includeSynthetic": selector.IncludeSynthetic,
	}
}

func onlinePolicyTargetMap(target contracts.OnlinePolicyTarget) map[string]any {
	values := map[string]any{}
	setOptionalString(values, "agentId", target.AgentID)
	setOptionalString(values, "agentName", target.AgentName)
	setOptionalString(values, "environment", target.Environment)
	setOptionalString(values, "serviceName", target.ServiceName)
	setOptionalString(values, "route", target.Route)
	setOptionalString(values, "routePrefix", target.RoutePrefix)
	setOptionalString(values, "toolName", target.ToolName)
	setOptionalString(values, "retrievalSource", target.RetrievalSource)
	setOptionalString(values, "model", target.Model)
	setOptionalString(values, "promptVersionId", target.PromptVersionID)
	setOptionalString(values, "experimentRunId", target.ExperimentRunID)
	if len(target.Attributes) > 0 {
		attributes := make([]any, 0, len(target.Attributes))
		for _, attribute := range target.Attributes {
			attributes = append(attributes, map[string]any{
				"key":      attribute.Key,
				"operator": string(attribute.Operator),
				"value":    attribute.Value,
			})
		}
		values["attributes"] = attributes
	}
	return values
}

func setOptionalString(values map[string]any, key string, value *string) {
	if value != nil {
		values[key] = *value
	}
}

func manifestFromMap(manifest map[string]any) ports.ExperimentManifest {
	return ports.ExperimentManifest{
		Digest:              stringValue(manifest, "digest"),
		ExperimentRunID:     stringValue(manifest, "experimentRunId"),
		ExperimentID:        stringValue(manifest, "experimentId"),
		DatasetID:           stringValue(manifest, "datasetId"),
		DatasetVersion:      intValue(manifest, "datasetVersion"),
		SplitSelector:       splitSelectorFromMap(objectValue(manifest, "splitSelector")),
		DatasetItemIDs:      stringArrayValue(manifest, "datasetItemIds"),
		ScorerRefs:          scorerRefsFromValue(manifest["scorerRefs"]),
		BaselineRef:         objectValue(manifest, "baselineRef"),
		SolverRef:           objectValue(manifest, "solverRef"),
		PromptVersionRefs:   stringArrayValue(manifest, "promptVersionRefs"),
		SkillSnapshotRefs:   stringArrayValue(manifest, "skillSnapshotRefs"),
		ToolSnapshotRefs:    stringArrayValue(manifest, "toolSnapshotRefs"),
		ProviderProfileRefs: stringArrayValue(manifest, "providerProfileRefs"),
		Budget:              objectValue(manifest, "budget"),
		Concurrency:         objectValue(manifest, "concurrency"),
	}
}

func splitSelectorFromMap(values map[string]any) ports.DatasetSplitSelector {
	return ports.DatasetSplitSelector{
		Splits:           stringArrayValue(values, "splits"),
		ReviewedOnly:     boolValue(values, "reviewedOnly"),
		IncludeSynthetic: boolValue(values, "includeSynthetic"),
	}
}

func scorerRefsFromValue(value any) []ports.VersionedRef {
	items, _ := value.([]any)
	refs := make([]ports.VersionedRef, 0, len(items))
	for _, item := range items {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		refs = append(refs, ports.VersionedRef{ID: stringValue(row, "id"), Version: intValue(row, "version")})
	}
	return refs
}

func errorFromBridge(err *contracts.BridgeError) error {
	if err == nil {
		return fmt.Errorf("%s %s: empty error response", messageBridgeErrorID, messageBridgeErrorCode)
	}
	return fmt.Errorf("%s %s: %s", err.ID, err.Code, err.Message)
}

func stringValue(values map[string]any, key string) string {
	value, _ := values[key].(string)
	return value
}

func intValue(values map[string]any, key string) int {
	switch value := values[key].(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	case json.Number:
		parsed, _ := value.Int64()
		return int(parsed)
	default:
		return 0
	}
}

func boolValue(values map[string]any, key string) bool {
	value, _ := values[key].(bool)
	return value
}

func objectValue(values map[string]any, key string) map[string]any {
	value, _ := values[key].(map[string]any)
	if value == nil {
		return map[string]any{}
	}
	return value
}

func stringArrayValue(values map[string]any, key string) []string {
	items, _ := values[key].([]any)
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value, ok := item.(string); ok {
			result = append(result, value)
		}
	}
	return result
}

func timeNowUTC(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Now().UTC()
	}
	return parsed.UTC()
}
