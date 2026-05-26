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

func (reader NATSStorageReader) GetDatasetVersion(ctx context.Context, datasetVersionID string) (ports.DatasetVersion, error) {
	data, err := reader.evalQuery(ctx, SubjectDatasetVersionGet, map[string]any{"datasetVersionId": datasetVersionID})
	if err != nil {
		return ports.DatasetVersion{}, err
	}
	version := objectValue(data, "version")
	return ports.DatasetVersion{
		ID:              stringValue(version, "id"),
		DatasetID:       stringValue(version, "datasetId"),
		Version:         intValue(version, "version"),
		Digest:          stringValue(version, "digest"),
		ItemRevisionIDs: stringArrayValue(version, "itemRevisionIds"),
		Settings:        objectValue(version, "settingsSnapshot"),
	}, nil
}

func (reader NATSStorageReader) SearchDatasetItemRevisions(ctx context.Context, datasetVersionID string, itemRevisionIDs []string) ([]ports.DatasetItemRevision, error) {
	input := map[string]any{"datasetVersionId": datasetVersionID}
	if len(itemRevisionIDs) > 0 {
		input["itemRevisionIds"] = itemRevisionIDs
	}
	data, err := reader.evalQuery(ctx, SubjectDatasetSearch, input)
	if err != nil {
		return nil, err
	}
	items, _ := data["items"].([]any)
	result := make([]ports.DatasetItemRevision, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			result = append(result, ports.DatasetItemRevision{
				ID:             stringValue(row, "id"),
				DatasetItemID:  stringValue(row, "datasetItemId"),
				DatasetID:      stringValue(row, "datasetId"),
				Revision:       intValue(row, "revision"),
				Input:          objectValue(row, "input"),
				Expected:       objectValue(row, "expected"),
				Reason:         stringValue(row, "reason"),
				Split:          stringValue(row, "split"),
				CurationStatus: stringValue(row, "curationStatus"),
				Metadata:       objectValue(row, "metadata"),
			})
		}
	}
	return result, nil
}

func (reader NATSStorageReader) GetTargetSnapshot(ctx context.Context, targetSnapshotID string) (ports.TargetSnapshot, error) {
	data, err := reader.evalQuery(ctx, SubjectTargetSnapshotGet, map[string]any{"targetSnapshotId": targetSnapshotID})
	if err != nil {
		return ports.TargetSnapshot{}, err
	}
	snapshot := objectValue(data, "snapshot")
	return ports.TargetSnapshot{
		ID:        stringValue(snapshot, "id"),
		TargetRef: objectValue(snapshot, "targetRef"),
		Kind:      stringValue(snapshot, "kind"),
		Name:      stringValue(snapshot, "name"),
		Version:   intValue(snapshot, "version"),
		Digest:    stringValue(snapshot, "digest"),
		Parts:     mapArrayValue(snapshot, "parts"),
		Metadata:  objectValue(snapshot, "metadata"),
	}, nil
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
		optimizerKind := contracts.OptimizerKind(request.OptimizerKind)
		resolveRequest.OptimizerKind = &optimizerKind
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
	if response.Data == nil {
		return ports.ExperimentManifest{}, nil
	}
	return manifestFromContract(response.Data.Manifest), nil
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
			Projection:    onlineProjectionFromContract(response.Data.Projection),
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
	return ports.ProjectAISettings{
		ProjectID:                 stringValue(settings, "projectId"),
		DefaultProviderProfileID:  stringValue(settings, "defaultProviderProfileId"),
		DefaultJudgeProfileID:     stringValue(settings, "defaultJudgeProfileId"),
		DefaultOptimizerProfileID: stringValue(settings, "defaultOptimizerProfileId"),
		ProviderProfiles:          mapArrayValue(settings, "providerProfiles"),
		ModelAliases:              mapArrayValue(settings, "modelAliases"),
		Budget:                    objectValue(settings, "budget"),
	}, nil
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

func (writer NATSStorageWriter) PersistEvaluationResults(ctx context.Context, result ports.EvaluationResultsPersist) error {
	payload := map[string]any{
		"evaluationRun":    evaluationRunMutationData(result.EvaluationRun),
		"itemRuns":         evaluationItemRunMutationData(result.ItemRuns),
		"metricResults":    metricResultMutationData(result.MetricResults),
		"metricAggregates": result.MetricAggregates,
	}
	if len(result.OptimizationRun) > 0 {
		payload["optimizationRun"] = result.OptimizationRun
	}
	request := contracts.EvaluationResultsPersistRequest{
		BridgeEnvelope:  runnerEnvelope(ctx, result.EvaluationRunID+":results-persist"),
		ProjectID:       result.ProjectID,
		EvaluationRunID: result.EvaluationRunID,
		IdempotencyKey:  result.IdempotencyKey,
		Payload:         payload,
	}
	responseData, err := requestJSON(ctx, writer.Requester, writer.timeout(), SubjectResultsPersist, request)
	if err != nil {
		return err
	}
	var response contracts.EvalMutationResponse
	if err := decodeStrict(responseData, &response); err != nil {
		return err
	}
	if !response.OK {
		return errorFromBridge(response.Error)
	}
	return nil
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

func (publisher NATSProgressPublisher) PublishEvaluationProgress(ctx context.Context, progress ports.ExperimentProgress) error {
	_ = ctx
	notification := map[string]any{
		"requestId":       stringDefault(progress.EvaluationRunID+":"+progress.Type, progress.ExperimentRunID+":"+progress.Type),
		"evaluationRunId": progress.EvaluationRunID,
		"type":            progress.Type,
		"occurredAt":      timeNowUTC(progress.OccurredAt),
	}
	if progress.Run != nil {
		notification["run"] = progress.Run
	}
	if progress.ItemRun != nil {
		notification["itemRun"] = progress.ItemRun
	}
	payload, err := marshalJSON(notification)
	if err != nil {
		return err
	}
	subject := SubjectExperimentProgress
	if progress.ProjectID != "" && progress.EvaluationRunID != "" {
		subject = fmt.Sprintf("eval.live.events.%s.%s", progress.ProjectID, progress.EvaluationRunID)
	}
	return publisher.Publisher.Publish(subject, payload)
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

func onlineProjectionFromContract(projection contracts.OnlinePolicyProjectionReadModel) ports.OnlinePolicyProjection {
	return ports.OnlinePolicyProjection{
		ProjectID:       projection.ProjectID,
		TraceID:         projection.TraceID,
		SpanID:          stringPtrValue(projection.SpanID),
		ProjectionID:    projection.ProjectionID,
		Kind:            string(projection.Kind),
		AgentID:         stringPtrValue(projection.AgentID),
		AgentName:       stringPtrValue(projection.AgentName),
		Environment:     stringPtrValue(projection.Environment),
		ServiceName:     stringPtrValue(projection.ServiceName),
		Route:           stringPtrValue(projection.Route),
		ToolName:        stringPtrValue(projection.ToolName),
		RetrievalSource: stringPtrValue(projection.RetrievalSource),
		Model:           stringPtrValue(projection.Model),
		PromptVersionID: stringPtrValue(projection.PromptVersionID),
		ExperimentRunID: stringPtrValue(projection.ExperimentRunID),
		SafeAttributes:  projection.SafeAttributes,
	}
}

func manifestFromContract(manifest contracts.ExperimentManifest) ports.ExperimentManifest {
	scorerRefs := make([]ports.VersionedRef, 0, len(manifest.ScorerRefs))
	for _, ref := range manifest.ScorerRefs {
		scorerRefs = append(scorerRefs, ports.VersionedRef{ID: ref.ID, Version: ref.Version})
	}
	return ports.ExperimentManifest{
		Digest:              manifest.Digest,
		ExperimentRunID:     manifest.ExperimentRunID,
		ExperimentID:        manifest.ExperimentID,
		DatasetID:           manifest.DatasetID,
		DatasetVersion:      manifest.DatasetVersion,
		SplitSelector:       ports.DatasetSplitSelector{Splits: append([]string(nil), manifest.SplitSelector.Splits...), ReviewedOnly: manifest.SplitSelector.ReviewedOnly, IncludeSynthetic: manifest.SplitSelector.IncludeSynthetic},
		DatasetItemIDs:      append([]string(nil), manifest.DatasetItemIDs...),
		ScorerRefs:          scorerRefs,
		SolverRef:           solverRefFromContract(manifest.SolverRef),
		PromptVersionRefs:   append([]string(nil), manifest.PromptVersionRefs...),
		SkillSnapshotRefs:   append([]string(nil), manifest.SkillSnapshotRefs...),
		ToolSnapshotRefs:    append([]string(nil), manifest.ToolSnapshotRefs...),
		ProviderProfileRefs: append([]string(nil), manifest.ProviderProfileRefs...),
		Budget:              copyAnyMap(manifest.Budget),
		Concurrency:         copyAnyMap(manifest.Concurrency),
		RunPolicy:           runPolicyFromContract(manifest.RunPolicy),
	}
}

func solverRefFromContract(ref contracts.EvalSolverRef) map[string]any {
	payload, _ := json.Marshal(ref)
	values := map[string]any{}
	_ = json.Unmarshal(payload, &values)
	return values
}

func runPolicyFromContract(policy contracts.EvalRunPolicy) map[string]any {
	payload, _ := json.Marshal(policy)
	values := map[string]any{}
	_ = json.Unmarshal(payload, &values)
	for key, value := range values {
		if value == nil {
			delete(values, key)
		}
	}
	return values
}

func copyAnyMap(values map[string]any) map[string]any {
	copied := map[string]any{}
	for key, value := range values {
		copied[key] = value
	}
	return copied
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

func evaluationRunMutationData(run ports.EvaluationRun) map[string]any {
	if run.ID == "" {
		return map[string]any{}
	}
	data := map[string]any{
		"id":                      run.ID,
		"projectId":               run.ProjectID,
		"kind":                    run.Kind,
		"status":                  run.Status,
		"datasetId":               run.DatasetID,
		"datasetVersionId":        run.DatasetVersionID,
		"datasetDigest":           run.DatasetDigest,
		"selectedItemRevisionIds": run.SelectedItemRevisionIDs,
		"splitSelector":           run.SplitSelector,
		"targetSnapshotId":        run.TargetSnapshotID,
		"metricSettingsSnapshot":  run.MetricSettingsSnapshot,
		"runPolicySnapshot":       run.RunPolicySnapshot,
		"retentionProfile":        run.RetentionProfile,
		"retentionRole":           run.RetentionRole,
		"startedAt":               run.StartedAt,
		"summary":                 run.Summary,
	}
	if run.EvaluationDefinitionID != "" {
		data["evaluationDefinitionId"] = run.EvaluationDefinitionID
	}
	if run.EndedAt != "" {
		data["endedAt"] = run.EndedAt
	}
	if len(run.Problem) > 0 {
		data["problem"] = run.Problem
	}
	return data
}

func evaluationItemRunMutationData(runs []ports.EvaluationItemRun) []any {
	items := make([]any, 0, len(runs))
	for _, run := range runs {
		item := map[string]any{
			"id":                    run.ID,
			"evaluationRunId":       run.EvaluationRunID,
			"datasetItemId":         run.DatasetItemID,
			"datasetItemRevisionId": run.DatasetItemRevisionID,
			"targetSnapshotId":      run.TargetSnapshotID,
			"status":                run.Status,
			"actualOutput":          run.ActualOutput,
			"actualOutputType":      run.ActualOutputType,
			"traceId":               run.TraceID,
			"rootSpanId":            run.RootSpanID,
			"metricResultIds":       run.MetricResultIDs,
			"problems":              run.Problems,
			"trajectorySummary":     run.TrajectorySummary,
			"summaryEvidenceRefs":   run.SummaryEvidenceRefs,
			"importantSteps":        run.ImportantSteps,
			"summaryDigest":         run.SummaryDigest,
			"summaryGeneratedAt":    run.SummaryGeneratedAt,
			"retentionRole":         run.RetentionRole,
			"startedAt":             run.StartedAt,
			"endedAt":               run.EndedAt,
		}
		if run.ConversationRef != "" {
			item["conversationRef"] = run.ConversationRef
		}
		items = append(items, item)
	}
	return items
}

func metricResultMutationData(results []ports.MetricResult) []any {
	items := make([]any, 0, len(results))
	for _, result := range results {
		item := map[string]any{
			"id":            result.ID,
			"metricId":      result.MetricID,
			"metricVersion": result.MetricVersion,
			"scope":         result.Scope,
			"subjectId":     result.SubjectID,
			"family":        result.Family,
			"payload":       result.Payload,
			"unit":          result.Unit,
			"direction":     result.Direction,
			"evidenceRefs":  result.EvidenceRefs,
			"metadata":      result.Metadata,
			"producedAt":    result.ProducedAt,
		}
		if len(result.Problem) > 0 {
			item["problem"] = result.Problem
		}
		items = append(items, item)
	}
	return items
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

func mapArrayValue(values map[string]any, key string) []map[string]any {
	items, _ := values[key].([]any)
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if value, ok := item.(map[string]any); ok {
			result = append(result, value)
		}
	}
	return result
}

func stringArrayValue(values map[string]any, key string) []string {
	if typed, ok := values[key].([]string); ok {
		return append([]string(nil), typed...)
	}
	items, _ := values[key].([]any)
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value, ok := item.(string); ok {
			result = append(result, value)
		}
	}
	return result
}

func stringDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func timeNowUTC(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Now().UTC()
	}
	return parsed.UTC()
}
