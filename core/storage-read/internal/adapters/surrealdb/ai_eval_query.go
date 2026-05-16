//go:build surrealdb

package surrealdb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	subjectEvalAgentRunsSearch   = "eval.agent_runs.search"
	subjectEvalDatasetSearch     = "eval.dataset.search"
	subjectEvalDatasetHealth     = "eval.dataset.health"
	subjectEvalScorerSearch      = "eval.scorer.search"
	subjectEvalExperimentSearch  = "eval.experiment.search"
	subjectEvalResultsSearch     = "eval.results.search"
	subjectEvalQualityOverview   = "eval.quality.overview"
	subjectAnnotationQueueSearch = "annotation.queue.search"
	aiEvalDefaultPageLimit       = 50
	aiEvalMaxPageLimit           = 200
)

func (store Store) QueryAiEval(ctx context.Context, subject string, input map[string]any) (map[string]any, error) {
	switch subject {
	case subjectEvalDatasetHealth:
		return store.queryDatasetHealth(ctx, input)
	case subjectEvalQualityOverview:
		return store.queryAiQualityOverview(ctx, input)
	}
	stmt, err := BuildAiEvalQuery(subject, input)
	if err != nil {
		return nil, err
	}
	items, err := queryRows[map[string]any](ctx, store.DB, stmt)
	if err != nil {
		return nil, storageError()
	}
	return map[string]any{
		"items":      items,
		"nextCursor": nil,
	}, nil
}

func (store Store) queryDatasetHealth(ctx context.Context, input map[string]any) (map[string]any, error) {
	stmts, err := BuildDatasetHealthQueries(input)
	if err != nil {
		return nil, err
	}
	summaryRows, err := queryRows[map[string]any](ctx, store.DB, stmts["summary"])
	if err != nil {
		return nil, storageError()
	}
	splitRows, err := queryRows[map[string]any](ctx, store.DB, stmts["splitCounts"])
	if err != nil {
		return nil, storageError()
	}
	duplicateRows, err := queryRows[map[string]any](ctx, store.DB, stmts["duplicates"])
	if err != nil {
		return nil, storageError()
	}
	health := firstMap(summaryRows)
	splitCounts := map[string]any{}
	for _, row := range splitRows {
		if split, ok := row["split"].(string); ok {
			splitCounts[split] = row["count"]
		}
	}
	health["splitCounts"] = splitCounts
	health["duplicateCandidateCount"] = len(duplicateRows)
	health["smallDataset"] = numericValue(health["reviewedItemCount"]) < 30
	health["warnings"] = datasetHealthWarnings(health)
	if len(health["warnings"].([]string)) > 0 {
		health["status"] = "warning"
	} else {
		health["status"] = "healthy"
	}
	return health, nil
}

func (store Store) queryAiQualityOverview(ctx context.Context, input map[string]any) (map[string]any, error) {
	stmts, err := BuildAiQualityOverviewQueries(input)
	if err != nil {
		return nil, err
	}
	segments, err := queryRows[map[string]any](ctx, store.DB, stmts["segments"])
	if err != nil {
		return nil, storageError()
	}
	summary, err := queryRows[map[string]any](ctx, store.DB, stmts["summary"])
	if err != nil {
		return nil, storageError()
	}
	return map[string]any{
		"projectId": aiEvalStringValue(input, "projectId", "default"),
		"from":      input["from"],
		"to":        input["to"],
		"summary":   firstMap(summary),
		"segments":  segments,
		"warnings":  []string{},
	}, nil
}

func (store Store) GetExperimentRunEventData(ctx context.Context, notification contracts.ExperimentProgressNotification) (map[string]any, map[string]any, error) {
	stmts, err := BuildExperimentRunEventQueries(notification.ExperimentRunID, notification.DatasetItemRunID)
	if err != nil {
		return nil, nil, err
	}
	runs, err := queryRows[map[string]any](ctx, store.DB, stmts["run"])
	if err != nil {
		return nil, nil, storageError()
	}
	var run map[string]any
	if len(runs) > 0 {
		run = runs[0]
	}
	var itemRun map[string]any
	if itemStmt, ok := stmts["itemRun"]; ok {
		itemRuns, err := queryRows[map[string]any](ctx, store.DB, itemStmt)
		if err != nil {
			return nil, nil, storageError()
		}
		if len(itemRuns) > 0 {
			itemRun = itemRuns[0]
		}
	}
	return run, itemRun, nil
}

func (store Store) ResolveExperimentManifest(ctx context.Context, request contracts.ExperimentManifestResolveRequest) (map[string]any, error) {
	stmts, err := BuildExperimentManifestResolveQueries(request)
	if err != nil {
		return nil, err
	}
	runRows, err := queryRows[map[string]any](ctx, store.DB, stmts["run"])
	if err != nil {
		return nil, storageError()
	}
	if len(runRows) > 0 {
		if manifest, ok := runRows[0]["manifest"].(map[string]any); ok && len(manifest) > 0 {
			return manifest, nil
		}
	}
	experiments, err := queryRows[map[string]any](ctx, store.DB, stmts["experiment"])
	if err != nil {
		return nil, storageError()
	}
	if len(experiments) == 0 {
		return nil, validationError("experiment was not found")
	}
	experiment := experiments[0]
	scorerIDs := stringSlice(experiment["scorerIds"])
	scorerStmt := stmts["scorers"]
	scorerStmt.Params["scorerIds"] = scorerIDs
	scorers, err := queryRows[map[string]any](ctx, store.DB, scorerStmt)
	if err != nil {
		return nil, storageError()
	}
	itemStmt := stmts["datasetItems"]
	itemStmt.Params["datasetId"] = experiment["datasetId"]
	itemStmt.Params["datasetVersion"] = experiment["datasetVersion"]
	items, err := queryRows[map[string]any](ctx, store.DB, itemStmt)
	if err != nil {
		return nil, storageError()
	}
	manifest := buildExperimentManifest(request, experiment, items, scorers)
	return manifest, nil
}

func BuildAiEvalQuery(subject string, input map[string]any) (QueryStatement, error) {
	table, err := aiEvalTableForSubject(subject, input)
	if err != nil {
		return QueryStatement{}, err
	}
	limit, err := aiEvalLimit(input)
	if err != nil {
		return QueryStatement{}, err
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return QueryStatement{}, err
	}

	params := map[string]any{"limit": limit}
	addOwnershipParams(params, target)
	conditions := ownershipConditions()
	addStringFilter(&conditions, params, input, "id", "id")
	switch subject {
	case subjectEvalAgentRunsSearch:
		addStringFilter(&conditions, params, input, "agentId", "agent.id")
		addStringFilter(&conditions, params, input, "agentName", "agent.name")
		addStringFilter(&conditions, params, input, "status", "status")
		addStringFilter(&conditions, params, input, "experimentRunId", "experimentRunId")
		addTimeFilter(&conditions, params, input, "from", "startedAt", ">=")
		addTimeFilter(&conditions, params, input, "to", "startedAt", "<=")
		addTextSearch(&conditions, params, input, []string{"traceId", "rootSpanId", "agent.name", "agent.id"})
	case subjectEvalDatasetSearch:
		if datasetID, ok := stringInput(input, "datasetId"); ok {
			conditions = append(conditions, "datasetId = $datasetId")
			params["datasetId"] = datasetID
		}
		addStringFilter(&conditions, params, input, "tag", "tags")
		addTextSearch(&conditions, params, input, []string{"id", "name", "description"})
	case subjectEvalScorerSearch:
		addStringFilter(&conditions, params, input, "kind", "kind")
		addTextSearch(&conditions, params, input, []string{"id", "name"})
	case subjectEvalExperimentSearch:
		addStringFilter(&conditions, params, input, "datasetId", "datasetId")
		addStringFilter(&conditions, params, input, "status", "status")
		addStringFilter(&conditions, params, input, "experimentId", "experimentId")
		addTextSearch(&conditions, params, input, []string{"id", "name"})
	case subjectEvalResultsSearch:
		addStringFilter(&conditions, params, input, "scorerId", "scorerId")
		addStringFilter(&conditions, params, input, "experimentRunId", "experimentRunId")
		addStringFilter(&conditions, params, input, "targetKind", "targetKind")
		addStringFilter(&conditions, params, input, "targetId", "targetId")
		addBoolFilter(&conditions, params, input, "passed", "passed")
	case subjectAnnotationQueueSearch:
		addStringFilter(&conditions, params, input, "status", "status")
		addStringFilter(&conditions, params, input, "reason", "reason")
		addStringFilter(&conditions, params, input, "assignedTo", "assignedTo")
		addStringFilter(&conditions, params, input, "scorerId", "scorerId")
		addStringFilter(&conditions, params, input, "targetKind", "targetKind")
	}

	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT *",
			"FROM " + table,
			whereClause(conditions),
			"ORDER BY createdAt DESC, id ASC",
			"LIMIT $limit;",
		}, " "),
		Params: params,
	}, nil
}

func BuildDatasetHealthQueries(input map[string]any) (map[string]QueryStatement, error) {
	datasetID, ok := stringInput(input, "datasetId")
	if !ok {
		return nil, validationError("datasetId is required")
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return nil, err
	}
	params := map[string]any{"datasetId": datasetID}
	addOwnershipParams(params, target)
	conditions := append(ownershipConditions(), "datasetId = $datasetId")
	return map[string]QueryStatement{
		"summary": {
			SQL: strings.Join([]string{
				"SELECT count() AS totalItemCount, math::sum(IF reviewStatus = 'reviewed' THEN 1 ELSE 0 END) AS reviewedItemCount, math::sum(IF expected = NONE THEN 1 ELSE 0 END) AS missingExpectedCount, math::sum(IF array::len(leakageWarnings) > 0 THEN 1 ELSE 0 END) AS leakageWarningCount, 0 AS schemaIssueCount",
				"FROM ai_dataset_item",
				whereClause(conditions),
				"GROUP ALL;",
			}, " "),
			Params: cloneParams(params),
		},
		"splitCounts": {
			SQL: strings.Join([]string{
				"SELECT split, count() AS count",
				"FROM ai_dataset_item",
				whereClause(conditions),
				"GROUP BY split;",
			}, " "),
			Params: cloneParams(params),
		},
		"duplicates": {
			SQL: strings.Join([]string{
				"SELECT id, duplicateOfItemId",
				"FROM ai_dataset_item",
				whereClause(append(conditions, "duplicateOfItemId != NONE")),
				"LIMIT 200;",
			}, " "),
			Params: cloneParams(params),
		},
	}, nil
}

func BuildAiQualityOverviewQueries(input map[string]any) (map[string]QueryStatement, error) {
	projectID, ok := stringInput(input, "projectId")
	if !ok {
		return nil, validationError("projectId is required")
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return nil, err
	}
	target.ProjectID = projectID
	params := map[string]any{}
	addOwnershipParams(params, target)
	conditions := ownershipConditions()
	addStringFilter(&conditions, params, input, "agentName", "agent.name")
	addStringFilter(&conditions, params, input, "environment", "metadata.environment")
	addStringFilter(&conditions, params, input, "service", "metadata.service")
	addStringFilter(&conditions, params, input, "route", "metadata.route")
	addTimeFilter(&conditions, params, input, "from", "startedAt", ">=")
	addTimeFilter(&conditions, params, input, "to", "startedAt", "<=")
	return map[string]QueryStatement{
		"segments": {
			SQL: strings.Join([]string{
				"SELECT string::join([agent.name, metadata.environment, metadata.service, metadata.route], ':') AS key, agent.name AS label, { agentName: agent.name, environment: metadata.environment, service: metadata.service, route: metadata.route } AS dimensions, count() AS runCount, math::sum(IF status != 'unset' THEN 1 ELSE 0 END) AS scoredRunCount, math::mean(durationMs) AS p50LatencyMs, math::max(durationMs) AS p95LatencyMs, math::sum(costEstimate.amount) AS costUsd, 0 AS regressionCount",
				"FROM ai_agent_run",
				whereClause(conditions),
				"GROUP BY agent.name, metadata.environment, metadata.service, metadata.route",
				"ORDER BY runCount DESC LIMIT 100;",
			}, " "),
			Params: cloneParams(params),
		},
		"summary": {
			SQL: strings.Join([]string{
				"SELECT count() AS runCount, math::mean(durationMs) AS meanLatencyMs, math::sum(costEstimate.amount) AS costUsd",
				"FROM ai_agent_run",
				whereClause(conditions),
				"GROUP ALL;",
			}, " "),
			Params: cloneParams(params),
		},
	}, nil
}

func BuildExperimentRunEventQueries(experimentRunID string, datasetItemRunID *string) (map[string]QueryStatement, error) {
	experimentRunID = strings.TrimSpace(experimentRunID)
	if experimentRunID == "" {
		return nil, validationError("experimentRunId is required")
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return nil, err
	}
	runParams := map[string]any{"experimentRunId": experimentRunID}
	addOwnershipParams(runParams, target)
	queries := map[string]QueryStatement{
		"run": {
			SQL: strings.Join([]string{
				"SELECT *",
				"FROM ai_experiment_run",
				whereClause(append(ownershipConditions(), "id = $experimentRunId")),
				"LIMIT 1;",
			}, " "),
			Params: runParams,
		},
	}
	if datasetItemRunID != nil && strings.TrimSpace(*datasetItemRunID) != "" {
		itemRunID := strings.TrimSpace(*datasetItemRunID)
		itemParams := map[string]any{"datasetItemRunId": itemRunID}
		addOwnershipParams(itemParams, target)
		queries["itemRun"] = QueryStatement{
			SQL: strings.Join([]string{
				"SELECT *",
				"FROM ai_dataset_item_run",
				whereClause(append(ownershipConditions(), "id = $datasetItemRunId")),
				"LIMIT 1;",
			}, " "),
			Params: itemParams,
		}
	}
	return queries, nil
}

func BuildExperimentManifestResolveQueries(request contracts.ExperimentManifestResolveRequest) (map[string]QueryStatement, error) {
	experimentRunID := strings.TrimSpace(request.ExperimentRunID)
	experimentID := strings.TrimSpace(request.ExperimentID)
	if experimentRunID == "" {
		return nil, validationError("experimentRunId is required")
	}
	if experimentID == "" {
		return nil, validationError("experimentId is required")
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return nil, err
	}
	params := map[string]any{
		"experimentRunId": experimentRunID,
		"experimentId":    experimentID,
		"scorerIds":       []string{},
	}
	addOwnershipParams(params, target)
	splitSelector := normalizeManifestSplitSelector(request.SplitSelector)
	itemParams := cloneParams(params)
	itemParams["splits"] = splitSelector["splits"]
	return map[string]QueryStatement{
		"run": {
			SQL: strings.Join([]string{
				"SELECT *",
				"FROM ai_experiment_run",
				whereClause(append(ownershipConditions(), "id = $experimentRunId")),
				"LIMIT 1;",
			}, " "),
			Params: cloneParams(params),
		},
		"experiment": {
			SQL: strings.Join([]string{
				"SELECT *",
				"FROM ai_experiment",
				whereClause(append(ownershipConditions(), "id = $experimentId")),
				"LIMIT 1;",
			}, " "),
			Params: cloneParams(params),
		},
		"datasetItems": {
			SQL: strings.Join([]string{
				"SELECT id, datasetId, version, split, reviewStatus, synthetic",
				"FROM ai_dataset_item",
				whereClause(append(ownershipConditions(), "datasetId = $datasetId", "version = $datasetVersion", "split IN $splits", "reviewStatus = 'reviewed'")),
				"ORDER BY id ASC LIMIT 10000;",
			}, " "),
			Params: itemParams,
		},
		"scorers": {
			SQL: strings.Join([]string{
				"SELECT id, version",
				"FROM ai_scorer",
				whereClause(append(ownershipConditions(), "id IN $scorerIds")),
				"ORDER BY id ASC;",
			}, " "),
			Params: cloneParams(params),
		},
	}, nil
}

func aiEvalTableForSubject(subject string, input map[string]any) (string, error) {
	switch subject {
	case subjectEvalAgentRunsSearch:
		return "ai_agent_run", nil
	case subjectEvalDatasetSearch:
		if _, ok := stringInput(input, "datasetId"); ok {
			return "ai_dataset_item", nil
		}
		return "ai_dataset", nil
	case subjectEvalScorerSearch:
		return "ai_scorer", nil
	case subjectEvalExperimentSearch:
		if _, ok := stringInput(input, "experimentRunId"); ok {
			return "ai_experiment_run", nil
		}
		return "ai_experiment", nil
	case subjectEvalResultsSearch:
		return "ai_eval_result", nil
	case subjectAnnotationQueueSearch:
		return "ai_annotation_queue_item", nil
	default:
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: storage-read does not handle AI eval subject %s", subject)
	}
}

func aiEvalLimit(input map[string]any) (int, error) {
	raw, ok := input["limit"]
	if !ok || raw == nil {
		return aiEvalDefaultPageLimit, nil
	}
	var limit int
	switch value := raw.(type) {
	case int:
		limit = value
	case int64:
		limit = int(value)
	case float64:
		limit = int(value)
	default:
		return 0, validationError("limit must be a number")
	}
	if limit < 1 || limit > aiEvalMaxPageLimit {
		return 0, validationError("limit must be between 1 and 200")
	}
	return limit, nil
}

func addStringFilter(conditions *[]string, params map[string]any, input map[string]any, inputKey string, field string) {
	value, ok := stringInput(input, inputKey)
	if !ok {
		return
	}
	*conditions = append(*conditions, field+" = $"+inputKey)
	params[inputKey] = value
}

func addBoolFilter(conditions *[]string, params map[string]any, input map[string]any, inputKey string, field string) {
	value, ok := input[inputKey].(bool)
	if !ok {
		return
	}
	*conditions = append(*conditions, field+" = $"+inputKey)
	params[inputKey] = value
}

func addTimeFilter(conditions *[]string, params map[string]any, input map[string]any, inputKey string, field string, operator string) {
	value, ok := timeInput(input, inputKey)
	if !ok {
		return
	}
	*conditions = append(*conditions, field+" "+operator+" $"+inputKey)
	params[inputKey] = value
}

func addTextSearch(conditions *[]string, params map[string]any, input map[string]any, fields []string) {
	query, ok := stringInput(input, "query")
	if !ok {
		return
	}
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		parts = append(parts, "string::lowercase("+field+") CONTAINS $query")
	}
	*conditions = append(*conditions, "("+strings.Join(parts, " OR ")+")")
	params["query"] = strings.ToLower(query)
}

func timeInput(input map[string]any, key string) (time.Time, bool) {
	raw, ok := input[key]
	if !ok || raw == nil {
		return time.Time{}, false
	}
	switch value := raw.(type) {
	case time.Time:
		return value.UTC(), true
	case string:
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
		if err != nil {
			return time.Time{}, false
		}
		return parsed.UTC(), true
	default:
		return time.Time{}, false
	}
}

func firstMap(rows []map[string]any) map[string]any {
	if len(rows) == 0 {
		return map[string]any{}
	}
	return rows[0]
}

func numericValue(value any) float64 {
	switch typed := value.(type) {
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case float64:
		return typed
	default:
		return 0
	}
}

func datasetHealthWarnings(health map[string]any) []string {
	warnings := []string{}
	if numericValue(health["reviewedItemCount"]) < 30 {
		warnings = append(warnings, "small_dataset")
	}
	if numericValue(health["duplicateCandidateCount"]) > 0 {
		warnings = append(warnings, "duplicate_candidates")
	}
	if numericValue(health["leakageWarningCount"]) > 0 {
		warnings = append(warnings, "split_leakage")
	}
	if numericValue(health["missingExpectedCount"]) > 0 {
		warnings = append(warnings, "missing_expected")
	}
	return warnings
}

func aiEvalStringValue(input map[string]any, key string, fallback string) string {
	value, ok := stringInput(input, key)
	if !ok {
		return fallback
	}
	return value
}

func normalizeManifestSplitSelector(input map[string]any) map[string]any {
	splits := []string{"validation"}
	reviewedOnly := true
	includeSynthetic := false
	if raw, ok := input["splits"]; ok {
		if values := stringSlice(raw); len(values) > 0 {
			splits = values
		}
	}
	if raw, ok := input["reviewedOnly"].(bool); ok {
		reviewedOnly = raw
	}
	if raw, ok := input["includeSynthetic"].(bool); ok {
		includeSynthetic = raw
	}
	return map[string]any{"splits": splits, "reviewedOnly": reviewedOnly, "includeSynthetic": includeSynthetic}
}

func stringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
				values = append(values, strings.TrimSpace(text))
			}
		}
		return values
	default:
		return nil
	}
}

func buildExperimentManifest(request contracts.ExperimentManifestResolveRequest, experiment map[string]any, items []map[string]any, scorers []map[string]any) map[string]any {
	splitSelector := normalizeManifestSplitSelector(request.SplitSelector)
	datasetItemIDs := make([]string, 0, len(items))
	for _, item := range items {
		if id, ok := item["id"].(string); ok {
			datasetItemIDs = append(datasetItemIDs, id)
		}
	}
	scorerRefs := make([]map[string]any, 0, len(scorers))
	for _, scorer := range scorers {
		if id, ok := scorer["id"].(string); ok {
			scorerRefs = append(scorerRefs, map[string]any{"id": id, "version": scorer["version"]})
		}
	}
	manifest := map[string]any{
		"schema":              "cloudgrid.ai-eval.experiment-manifest.v1",
		"version":             1,
		"experimentRunId":     request.ExperimentRunID,
		"experimentId":        request.ExperimentID,
		"datasetId":           experiment["datasetId"],
		"datasetVersion":      experiment["datasetVersion"],
		"splitSelector":       splitSelector,
		"datasetItemIds":      datasetItemIDs,
		"scorerRefs":          scorerRefs,
		"baselineRef":         experiment["baselineRef"],
		"solverRef":           experiment["solverRef"],
		"promptVersionRefs":   stringSlice(experiment["promptVersionRefs"]),
		"skillSnapshotRefs":   stringSlice(experiment["skillSnapshotRefs"]),
		"toolSnapshotRefs":    stringSlice(experiment["toolSnapshotRefs"]),
		"providerProfileRefs": stringSlice(experiment["providerProfileRefs"]),
		"budget":              map[string]any{},
		"concurrency":         map[string]any{},
		"createdAt":           time.Now().UTC().Format(time.RFC3339),
	}
	manifest["digest"] = manifestDigest(manifest)
	return manifest
}

func manifestDigest(manifest map[string]any) string {
	canonical := map[string]any{}
	for key, value := range manifest {
		if key == "digest" {
			continue
		}
		canonical[key] = value
	}
	data, _ := json.Marshal(canonical)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func stringInput(input map[string]any, key string) (string, bool) {
	raw, ok := input[key]
	if !ok || raw == nil {
		return "", false
	}
	value, ok := raw.(string)
	if !ok {
		return "", false
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	return value, true
}
