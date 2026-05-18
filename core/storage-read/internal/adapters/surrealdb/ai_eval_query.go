//go:build surrealdb

package surrealdb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
)

const (
	subjectEvalAgentRunsSearch    = "eval.agent_runs.search"
	subjectEvalDatasetSearch      = "eval.dataset.search"
	subjectEvalDatasetExportStart = "eval.dataset.export.start"
	subjectEvalDatasetTransferGet = "eval.dataset.transfer.get"
	subjectEvalDatasetHealth      = "eval.dataset.health"
	subjectEvalScorerSearch       = "eval.scorer.search"
	subjectEvalExperimentSearch   = "eval.experiment.search"
	subjectEvalResultsSearch      = "eval.results.search"
	subjectEvalQualityOverview    = "eval.quality.overview"
	subjectAnnotationQueueSearch  = "annotation.queue.search"
	aiEvalDefaultPageLimit        = 50
	aiEvalMaxPageLimit            = 200
)

func (store Store) QueryAiEval(ctx context.Context, subject string, input map[string]any) (map[string]any, error) {
	switch subject {
	case subjectEvalDatasetTransferGet:
		return storage.GetDatasetTransfer(ctx, storage.TransferRootForAdapter(), input)
	case subjectEvalDatasetExportStart:
		return store.startDatasetExport(ctx, input)
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
	if subject == subjectEvalDatasetSearch {
		if _, ok := stringInput(input, "datasetId"); !ok {
			items, err = store.withDatasetListCounts(ctx, items)
			if err != nil {
				return nil, storageError()
			}
		}
	}
	return map[string]any{
		"items":      shapeAiEvalItems(subject, input, items),
		"nextCursor": nil,
	}, nil
}

func (store Store) withDatasetListCounts(ctx context.Context, rows []map[string]any) ([]map[string]any, error) {
	datasetIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		if id := aiEvalRecordID(row); id != "" {
			datasetIDs = append(datasetIDs, id)
		}
	}
	if len(datasetIDs) == 0 {
		return rows, nil
	}
	stmt, err := BuildDatasetListCountsQuery(datasetIDs)
	if err != nil {
		return nil, err
	}
	counts, err := queryRows[map[string]any](ctx, store.DB, stmt)
	if err != nil {
		return nil, err
	}
	countsByDataset := map[string]map[string]any{}
	for _, count := range counts {
		if datasetID := aiEvalStringValue(count, "datasetId", ""); datasetID != "" {
			countsByDataset[datasetID] = count
		}
	}
	for _, row := range rows {
		count := countsByDataset[aiEvalRecordID(row)]
		if count == nil {
			continue
		}
		row["itemCount"] = count["itemCount"]
		row["reviewedItemCount"] = count["reviewedItemCount"]
	}
	return rows, nil
}

func (store Store) startDatasetExport(ctx context.Context, input map[string]any) (map[string]any, error) {
	stmt, err := BuildDatasetExportItemsQuery(input)
	if err != nil {
		return nil, err
	}
	items, err := queryRows[map[string]any](ctx, store.DB, stmt)
	if err != nil {
		return nil, storageError()
	}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "storage-read-export",
			IssuedAt:  time.Now().UTC(),
		},
		Input: input,
	}
	return storage.StartDatasetExport(ctx, storage.TransferRootForAdapter(), request, items, time.Now)
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
	if numericValue(health["leakageWarningCount"]) > 0 {
		health["status"] = "leakage_warning"
	} else if len(health["warnings"].([]string)) > 0 {
		health["status"] = "needs_review"
	} else {
		health["status"] = "ready"
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
		"summary":   shapeAiQualitySummary(firstMap(summary)),
		"segments":  shapeAiQualitySegments(segments),
		"warnings":  []string{},
	}, nil
}

func shapeAiQualitySummary(row map[string]any) map[string]any {
	return map[string]any{
		"runCount":      intValueFromAny(row["runCount"]),
		"meanLatencyMs": numericValue(row["meanLatencyMs"]),
		"costUsd":       numericValue(row["costUsd"]),
	}
}

func shapeAiQualitySegments(rows []map[string]any) []map[string]any {
	segments := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		agentName := aiEvalStringValue(row, "agentName", "unknown")
		environment := aiEvalStringValue(row, "environment", "")
		service := aiEvalStringValue(row, "service", "")
		route := aiEvalStringValue(row, "route", "")
		segment := cloneParams(row)
		segment["key"] = strings.Join([]string{agentName, environment, service, route}, ":")
		segment["label"] = agentName
		segment["dimensions"] = map[string]any{
			"agentName":   agentName,
			"environment": environment,
			"service":     service,
			"route":       route,
		}
		segment["runCount"] = intValueFromAny(row["runCount"])
		segment["scoredRunCount"] = intValueFromAny(row["scoredRunCount"])
		segment["p50LatencyMs"] = numericValue(row["p50LatencyMs"])
		segment["p95LatencyMs"] = numericValue(row["p95LatencyMs"])
		segment["costUsd"] = numericValue(row["costUsd"])
		segment["regressionCount"] = intValueFromAny(row["regressionCount"])
		delete(segment, "agentName")
		delete(segment, "environment")
		delete(segment, "service")
		delete(segment, "route")
		segments = append(segments, segment)
	}
	return segments
}

func shapeAiEvalItems(subject string, input map[string]any, rows []map[string]any) []map[string]any {
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		switch subject {
		case subjectEvalAgentRunsSearch:
			items = append(items, shapeAgentRunRow(row))
		case subjectEvalDatasetSearch:
			if _, ok := stringInput(input, "datasetId"); ok {
				items = append(items, shapeDatasetItemRow(row))
			} else {
				items = append(items, shapeDatasetRow(row))
			}
		case subjectEvalScorerSearch:
			items = append(items, shapeScorerRow(row))
		case subjectEvalExperimentSearch:
			if aiEvalExperimentSearchReturnsDatasetItemRuns(input) {
				items = append(items, shapeDatasetItemRunRow(row))
			} else if aiEvalExperimentSearchReturnsRuns(input) {
				items = append(items, shapeExperimentRunRow(row))
			} else {
				items = append(items, shapeExperimentRow(row))
			}
		case subjectEvalResultsSearch:
			items = append(items, shapeEvalResultRow(row))
		case subjectAnnotationQueueSearch:
			items = append(items, shapeAnnotationQueueRow(row))
		default:
			items = append(items, cloneParams(row))
		}
	}
	return items
}

func shapeAgentRunRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	agent := objectMap(item["agent"])
	if len(agent) == 0 {
		agent = map[string]any{}
	}
	if _, ok := stringInput(agent, "name"); !ok {
		agent["name"] = aiEvalStringValue(item, "agentName", "unknown")
	}
	item["agent"] = agent
	if _, ok := stringInput(item, "rootSpanId"); !ok {
		if spanID, ok := stringInput(item, "spanId"); ok {
			item["rootSpanId"] = spanID
		}
	}
	if _, ok := stringInput(item, "status"); !ok {
		item["status"] = "unset"
	}
	if _, ok := item["startedAt"]; !ok || item["startedAt"] == nil {
		item["startedAt"] = fallbackTime()
	}
	for _, key := range []string{"transcript", "llmCalls", "toolCalls", "retrievalEvents", "evalResults"} {
		if _, ok := item[key]; !ok || item[key] == nil {
			item[key] = []any{}
		}
	}
	return item
}

func shapeDatasetRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	itemCount := intValueFromAny(item["itemCount"])
	reviewedItemCount := intValueFromAny(item["reviewedItemCount"])
	item["version"] = maxIntValue(intValueFromAny(item["version"]), 1)
	item["itemCount"] = itemCount
	item["reviewedItemCount"] = reviewedItemCount
	splitCounts := objectMap(item["splitCounts"])
	if len(splitCounts) == 0 {
		splitCounts = map[string]any{}
	}
	item["splitCounts"] = splitCounts
	item["tags"] = stringsFromAny(item["tags"])
	health := objectMap(item["health"])
	if len(health) == 0 {
		health = map[string]any{}
	}
	health["reviewedItemCount"] = intValueFromAny(defaultAny(health["reviewedItemCount"], reviewedItemCount))
	health["totalItemCount"] = intValueFromAny(defaultAny(health["totalItemCount"], itemCount))
	health["splitCounts"] = defaultAny(health["splitCounts"], splitCounts)
	health["duplicateCandidateCount"] = intValueFromAny(health["duplicateCandidateCount"])
	health["leakageWarningCount"] = intValueFromAny(health["leakageWarningCount"])
	health["missingExpectedCount"] = intValueFromAny(health["missingExpectedCount"])
	health["schemaIssueCount"] = intValueFromAny(health["schemaIssueCount"])
	health["smallDataset"] = boolFromAny(defaultAny(health["smallDataset"], reviewedItemCount < 30))
	health["warnings"] = stringsFromAny(health["warnings"])
	if _, ok := stringInput(health, "status"); !ok {
		health["status"] = datasetHealthStatusFromCounts(health)
	}
	item["health"] = health
	return item
}

func shapeDatasetItemRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	item["version"] = maxIntValue(intValueFromAny(item["version"]), 1)
	if _, ok := item["metadata"]; !ok || item["metadata"] == nil {
		item["metadata"] = map[string]any{}
	}
	if _, ok := stringInput(item, "split"); !ok {
		item["split"] = "dev"
	}
	if _, ok := stringInput(item, "reviewStatus"); !ok {
		item["reviewStatus"] = "unreviewed"
	}
	item["synthetic"] = boolFromAny(item["synthetic"])
	item["leakageWarnings"] = stringsFromAny(item["leakageWarnings"])
	return item
}

func shapeScorerRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	item["version"] = maxIntValue(intValueFromAny(item["version"]), 1)
	if _, ok := item["definition"]; !ok || item["definition"] == nil {
		item["definition"] = map[string]any{}
	}
	return item
}

func shapeExperimentRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	item["datasetVersion"] = maxIntValue(intValueFromAny(item["datasetVersion"]), 1)
	if _, ok := item["createdAt"]; !ok || item["createdAt"] == nil {
		item["createdAt"] = fallbackTime()
	}
	item["splitSelector"] = normalizeManifestSplitSelector(objectMap(item["splitSelector"]))
	item["scorerIds"] = stringsFromAny(item["scorerIds"])
	item["promptVersionRefs"] = stringsFromAny(item["promptVersionRefs"])
	item["skillSnapshotRefs"] = stringsFromAny(item["skillSnapshotRefs"])
	item["toolSnapshotRefs"] = stringsFromAny(item["toolSnapshotRefs"])
	item["providerProfileRefs"] = stringsFromAny(item["providerProfileRefs"])
	item["tags"] = stringsFromAny(item["tags"])
	return item
}

func shapeExperimentRunRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	if _, ok := item["solverRef"]; !ok || item["solverRef"] == nil {
		item["solverRef"] = map[string]any{}
	}
	if _, ok := stringInput(item, "status"); !ok {
		item["status"] = "queued"
	}
	if _, ok := item["startedAt"]; !ok || item["startedAt"] == nil {
		item["startedAt"] = fallbackTime()
	}
	if _, ok := item["summary"]; !ok || item["summary"] == nil {
		item["summary"] = map[string]any{}
	}
	return item
}

func shapeDatasetItemRunRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	if _, ok := item["output"]; !ok || item["output"] == nil {
		item["output"] = map[string]any{}
	}
	item["latencyMs"] = numericValue(item["latencyMs"])
	if _, ok := item["evalResults"]; !ok || item["evalResults"] == nil {
		item["evalResults"] = []any{}
	}
	return item
}

func shapeEvalResultRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	if _, ok := item["producedAt"]; !ok || item["producedAt"] == nil {
		item["producedAt"] = fallbackTime()
	}
	return item
}

func shapeAnnotationQueueRow(row map[string]any) map[string]any {
	item := cloneParams(row)
	applyRecordID(item)
	if _, ok := stringInput(item, "status"); !ok {
		item["status"] = "open"
	}
	if _, ok := item["createdAt"]; !ok || item["createdAt"] == nil {
		item["createdAt"] = fallbackTime()
	}
	return item
}

func applyRecordID(item map[string]any) {
	if id, ok := stringInput(item, "id"); ok {
		item["id"] = id
		return
	}
	if id, ok := stringInput(item, "recordId"); ok {
		item["id"] = id
		delete(item, "recordId")
		return
	}
	if raw := item["id"]; raw != nil {
		text := fmt.Sprint(raw)
		text = strings.Trim(text, "{}")
		if strings.TrimSpace(text) != "" {
			item["id"] = strings.TrimSpace(text)
		}
	}
}

func aiEvalRecordID(item map[string]any) string {
	if id, ok := stringInput(item, "recordId"); ok {
		return id
	}
	if id, ok := stringInput(item, "id"); ok {
		return id
	}
	if raw := item["id"]; raw != nil {
		text := strings.Trim(fmt.Sprint(raw), "{}")
		if strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
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
		run = shapeExperimentRunRow(runs[0])
	}
	var itemRun map[string]any
	if itemStmt, ok := stmts["itemRun"]; ok {
		itemRuns, err := queryRows[map[string]any](ctx, store.DB, itemStmt)
		if err != nil {
			return nil, nil, storageError()
		}
		if len(itemRuns) > 0 {
			itemRun = shapeDatasetItemRunRow(itemRuns[0])
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

func (store Store) ResolveOnlinePolicyMatches(ctx context.Context, request contracts.OnlinePolicyMatchesResolveRequest) (contracts.OnlinePolicyMatchesResolveData, error) {
	stmts, err := BuildOnlinePolicyMatchesResolveQueries(request)
	if err != nil {
		return contracts.OnlinePolicyMatchesResolveData{}, err
	}
	settingsRows, err := queryRows[map[string]any](ctx, store.DB, stmts["settings"])
	if err != nil {
		return contracts.OnlinePolicyMatchesResolveData{}, storageError()
	}
	if len(settingsRows) == 0 {
		return contracts.OnlinePolicyMatchesResolveData{Matches: []contracts.OnlinePolicyMatch{}, Warnings: []string{}}, nil
	}
	projections, err := queryRows[map[string]any](ctx, store.DB, stmts["projection"])
	if err != nil {
		return contracts.OnlinePolicyMatchesResolveData{}, storageError()
	}
	if len(projections) == 0 {
		return contracts.OnlinePolicyMatchesResolveData{Matches: []contracts.OnlinePolicyMatch{}, Warnings: []string{}}, nil
	}
	scorers, err := queryRows[map[string]any](ctx, store.DB, stmts["scorers"])
	if err != nil {
		return contracts.OnlinePolicyMatchesResolveData{}, storageError()
	}
	scorersByID := map[string]onlineScorerRow{}
	for _, scorer := range scorers {
		id := aiEvalStringValue(scorer, "id", "")
		if id != "" {
			scorersByID[id] = onlineScorerRow{kind: aiEvalStringValue(scorer, "kind", ""), version: int(numericValue(scorer["version"]))}
		}
	}
	matches := []contracts.OnlinePolicyMatch{}
	warnings := []string{}
	for _, setting := range settingsRows {
		for _, policy := range onlinePolicies(setting["onlinePolicies"]) {
			if !boolValue(policy, "enabled") {
				continue
			}
			target := onlinePolicyTargetFromMap(objectMap(policy["target"]))
			if isEmptyOnlineTarget(target) {
				warnings = append(warnings, "invalid empty target for policy "+aiEvalStringValue(policy, "id", ""))
				continue
			}
			scorerRefs := []contracts.OnlinePolicyScorerRef{}
			for _, scorerID := range stringSlice(policy["scorerIds"]) {
				scorer := scorersByID[scorerID]
				if scorer.kind != "deterministic" || scorer.version < 1 {
					warnings = append(warnings, "unsupported scorer kind for policy "+aiEvalStringValue(policy, "id", ""))
					continue
				}
				scorerRefs = append(scorerRefs, contracts.OnlinePolicyScorerRef{
					ScorerID:      scorerID,
					ScorerVersion: scorer.version,
					Kind:          "deterministic",
				})
			}
			if len(scorerRefs) == 0 {
				continue
			}
			for _, projection := range projections {
				projectionModel := onlineProjectionFromRow(projection, request)
				if !onlinePolicyTargetMatchesProjection(target, projectionModel) {
					continue
				}
				matches = append(matches, contracts.OnlinePolicyMatch{
					PolicyID:      aiEvalStringValue(policy, "id", ""),
					PolicyVersion: onlinePolicyVersion(policy),
					PolicyName:    aiEvalStringValue(policy, "name", ""),
					Target:        target,
					SampleRate:    numericValue(policy["sampleRate"]),
					ScorerRefs:    scorerRefs,
					Projection:    projectionModel,
				})
			}
		}
	}
	return contracts.OnlinePolicyMatchesResolveData{Matches: matches, Warnings: warnings}, nil
}

func BuildOnlinePolicyMatchesResolveQueries(request contracts.OnlinePolicyMatchesResolveRequest) (map[string]QueryStatement, error) {
	if strings.TrimSpace(request.ProjectID) == "" {
		return nil, validationError("projectId is required")
	}
	if strings.TrimSpace(request.TraceID) == "" {
		return nil, validationError("traceId is required")
	}
	if len(request.ProjectionIDs) == 0 {
		return nil, validationError("projectionIds is required")
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return nil, err
	}
	target.ProjectID = request.ProjectID
	params := map[string]any{
		"projectId":     request.ProjectID,
		"traceId":       request.TraceID,
		"projectionIds": append([]string(nil), request.ProjectionIDs...),
		"spanIds":       append([]string(nil), request.SpanIDs...),
		"kinds":         request.Kinds,
	}
	addOwnershipParams(params, target)
	return map[string]QueryStatement{
		"settings": {
			SQL: strings.Join([]string{
				"SELECT *",
				"FROM project_ai_settings",
				whereClause(append(ownershipConditions(), "projectId = $projectId", "enabled = true")),
				"LIMIT 1;",
			}, " "),
			Params: cloneParams(params),
		},
		"projection": {
			SQL: strings.Join([]string{
				"SELECT id, projectId, traceId, rootSpanId AS spanId, 'agent_run' AS kind, agent.id AS agentId, agent.name AS agentName, metadata.environment AS environment, metadata.service AS serviceName, metadata.route AS route, metadata.model AS model, metadata.promptVersionId AS promptVersionId, metadata.experimentRunId AS experimentRunId, metadata.safeAttributes AS safeAttributes",
				"FROM ai_agent_run",
				whereClause(append(ownershipConditions(), "projectId = $projectId", "traceId = $traceId", "id IN $projectionIds")),
				"ORDER BY id ASC LIMIT 200;",
			}, " "),
			Params: cloneParams(params),
		},
		"scorers": {
			SQL: strings.Join([]string{
				"SELECT id, version, kind",
				"FROM ai_scorer",
				whereClause(append(ownershipConditions(), "projectId = $projectId", "kind = 'deterministic'")),
				"ORDER BY id ASC LIMIT 1000;",
			}, " "),
			Params: cloneParams(params),
		},
	}, nil
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
	addRecordIDFilter(&conditions, params, input, "id")
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
		if aiEvalExperimentSearchReturnsDatasetItemRuns(input) {
			addStringFilter(&conditions, params, input, "experimentRunId", "experimentRunId")
		} else if _, ok := stringInput(input, "experimentRunId"); ok {
			addRecordIDFilter(&conditions, params, input, "experimentRunId")
		}
		if !aiEvalExperimentSearchReturnsRuns(input) {
			addStringFilter(&conditions, params, input, "datasetId", "datasetId")
		}
		addStringFilter(&conditions, params, input, "status", "status")
		addStringFilter(&conditions, params, input, "experimentId", "experimentId")
		if !aiEvalExperimentSearchReturnsRuns(input) {
			addTextSearch(&conditions, params, input, []string{"id", "name"})
		}
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
			"SELECT " + aiEvalProjectionForSubject(subject, input),
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

func BuildDatasetListCountsQuery(datasetIDs []string) (QueryStatement, error) {
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return QueryStatement{}, err
	}
	params := map[string]any{"datasetIds": datasetIDs}
	addOwnershipParams(params, target)
	conditions := append(ownershipConditions(), "datasetId IN $datasetIds")
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT datasetId, count() AS itemCount, math::sum(IF reviewStatus = 'reviewed' THEN 1 ELSE 0 END) AS reviewedItemCount",
			"FROM ai_dataset_item",
			whereClause(conditions),
			"GROUP BY datasetId;",
		}, " "),
		Params: params,
	}, nil
}

func BuildDatasetExportItemsQuery(input map[string]any) (QueryStatement, error) {
	datasetID, ok := stringInput(input, "datasetId")
	if !ok {
		return QueryStatement{}, validationError("datasetId is required")
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return QueryStatement{}, err
	}
	params := map[string]any{"datasetId": datasetID}
	addOwnershipParams(params, target)
	conditions := append(ownershipConditions(), "datasetId = $datasetId")
	addStringFilter(&conditions, params, input, "split", "split")
	addStringFilter(&conditions, params, input, "reviewStatus", "reviewStatus")
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT id, input, expected, metadata, sourceTraceId, sourceSpanId, split, reviewStatus, synthetic",
			"FROM ai_dataset_item",
			whereClause(conditions),
			"ORDER BY id ASC LIMIT 50000;",
		}, " "),
		Params: params,
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
				"SELECT agent.name AS agentName, metadata.environment AS environment, metadata.service AS service, metadata.route AS route, count() AS runCount, math::sum(IF status != 'unset' THEN 1 ELSE 0 END) AS scoredRunCount, math::mean(durationMs) AS p50LatencyMs, math::max(durationMs) AS p95LatencyMs, math::sum(costEstimate.amount) AS costUsd, 0 AS regressionCount",
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
				whereClause(append(ownershipConditions(), "record::id(id) = $experimentRunId")),
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
				whereClause(append(ownershipConditions(), "record::id(id) = $datasetItemRunId")),
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
				whereClause(append(ownershipConditions(), "record::id(id) = $experimentRunId")),
				"LIMIT 1;",
			}, " "),
			Params: cloneParams(params),
		},
		"experiment": {
			SQL: strings.Join([]string{
				"SELECT *",
				"FROM ai_experiment",
				whereClause(append(ownershipConditions(), "record::id(id) = $experimentId")),
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
				whereClause(append(ownershipConditions(), "record::id(id) IN $scorerIds")),
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
		if aiEvalExperimentSearchReturnsDatasetItemRuns(input) {
			return "ai_dataset_item_run", nil
		}
		if aiEvalExperimentSearchReturnsRuns(input) {
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

func aiEvalExperimentSearchReturnsRuns(input map[string]any) bool {
	if aiEvalExperimentSearchReturnsDatasetItemRuns(input) {
		return false
	}
	if _, ok := stringInput(input, "experimentRunId"); ok {
		return true
	}
	if _, ok := stringInput(input, "experimentId"); ok {
		return true
	}
	return false
}

func aiEvalExperimentSearchReturnsDatasetItemRuns(input map[string]any) bool {
	value, ok := input["itemRuns"].(bool)
	return ok && value
}

func aiEvalProjectionForSubject(subject string, input map[string]any) string {
	if subject == subjectEvalDatasetSearch {
		if _, ok := stringInput(input, "datasetId"); !ok {
			return "*, record::id(id) AS recordId"
		}
	}
	return "*, record::id(id) AS recordId"
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

func addRecordIDFilter(conditions *[]string, params map[string]any, input map[string]any, inputKey string) {
	value, ok := stringInput(input, inputKey)
	if !ok {
		return
	}
	*conditions = append(*conditions, "record::id(id) = $"+inputKey)
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
		if field == "id" {
			parts = append(parts, "string::lowercase(record::id(id)) CONTAINS $query")
			continue
		}
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
	case int8:
		return float64(typed)
	case int16:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case uint:
		return float64(typed)
	case uint8:
		return float64(typed)
	case uint16:
		return float64(typed)
	case uint32:
		return float64(typed)
	case uint64:
		return float64(typed)
	case float32:
		return finiteNumber(float64(typed))
	case float64:
		return finiteNumber(typed)
	case string:
		parsed, err := strconv.ParseFloat(typed, 64)
		if err == nil {
			return finiteNumber(parsed)
		}
		return 0
	default:
		return 0
	}
}

func finiteNumber(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return value
}

func intValueFromAny(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int8:
		return int(typed)
	case int16:
		return int(typed)
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case uint:
		return int(typed)
	case uint8:
		return int(typed)
	case uint16:
		return int(typed)
	case uint32:
		return int(typed)
	case uint64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
		return 0
	default:
		return 0
	}
}

func maxIntValue(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func boolFromAny(value any) bool {
	typed, _ := value.(bool)
	return typed
}

func defaultAny(value any, fallback any) any {
	if value == nil {
		return fallback
	}
	return value
}

func stringsFromAny(value any) []string {
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
		return []string{}
	}
}

func datasetHealthStatusFromCounts(health map[string]any) string {
	if intValueFromAny(health["leakageWarningCount"]) > 0 {
		return "leakage_warning"
	}
	if intValueFromAny(health["schemaIssueCount"]) > 0 {
		return "invalid"
	}
	if intValueFromAny(health["missingExpectedCount"]) > 0 || boolFromAny(health["smallDataset"]) {
		return "needs_review"
	}
	return "ready"
}

func fallbackTime() string {
	return time.Unix(0, 0).UTC().Format(time.RFC3339)
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

func boolValue(values map[string]any, key string) bool {
	value, _ := values[key].(bool)
	return value
}

func onlinePolicies(value any) []map[string]any {
	return mapSlice(value)
}

type onlineScorerRow struct {
	kind    string
	version int
}

func onlinePolicyVersion(policy map[string]any) int {
	version := int(numericValue(policy["version"]))
	if version < 1 {
		return 1
	}
	return version
}

func mapSlice(value any) []map[string]any {
	items, _ := value.([]any)
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			result = append(result, row)
		}
	}
	return result
}

func onlineProjectionFromRow(row map[string]any, request contracts.OnlinePolicyMatchesResolveRequest) contracts.OnlinePolicyProjectionReadModel {
	projectionID := aiEvalStringValue(row, "id", "")
	if projectionID == "" {
		projectionID = aiEvalStringValue(row, "projectionId", "")
	}
	kind := contracts.AiProjectionKind(aiEvalStringValue(row, "kind", string(contracts.AiProjectionKindAgentRun)))
	return contracts.OnlinePolicyProjectionReadModel{
		ProjectID:       aiEvalStringValue(row, "projectId", request.ProjectID),
		TraceID:         aiEvalStringValue(row, "traceId", request.TraceID),
		SpanID:          optionalStringFromMap(row, "spanId"),
		ProjectionID:    projectionID,
		Kind:            kind,
		AgentID:         optionalStringFromMap(row, "agentId"),
		AgentName:       optionalStringFromMap(row, "agentName"),
		Environment:     optionalStringFromMap(row, "environment"),
		ServiceName:     optionalStringFromMap(row, "serviceName"),
		Route:           optionalStringFromMap(row, "route"),
		ToolName:        optionalStringFromMap(row, "toolName"),
		RetrievalSource: optionalStringFromMap(row, "retrievalSource"),
		Model:           optionalStringFromMap(row, "model"),
		PromptVersionID: optionalStringFromMap(row, "promptVersionId"),
		ExperimentRunID: optionalStringFromMap(row, "experimentRunId"),
		SafeAttributes:  objectMap(row["safeAttributes"]),
	}
}

func onlinePolicyTargetFromMap(values map[string]any) contracts.OnlinePolicyTarget {
	return contracts.OnlinePolicyTarget{
		AgentID:         optionalStringFromMap(values, "agentId"),
		AgentName:       optionalStringFromMap(values, "agentName"),
		Environment:     optionalStringFromMap(values, "environment"),
		ServiceName:     optionalStringFromMap(values, "serviceName"),
		Route:           optionalStringFromMap(values, "route"),
		RoutePrefix:     optionalStringFromMap(values, "routePrefix"),
		ToolName:        optionalStringFromMap(values, "toolName"),
		RetrievalSource: optionalStringFromMap(values, "retrievalSource"),
		Model:           optionalStringFromMap(values, "model"),
		PromptVersionID: optionalStringFromMap(values, "promptVersionId"),
		ExperimentRunID: optionalStringFromMap(values, "experimentRunId"),
		Attributes:      onlineAttributeFilters(values["attributes"]),
	}
}

func isEmptyOnlineTarget(target contracts.OnlinePolicyTarget) bool {
	return target.AgentID == nil &&
		target.AgentName == nil &&
		target.Environment == nil &&
		target.ServiceName == nil &&
		target.Route == nil &&
		target.RoutePrefix == nil &&
		target.ToolName == nil &&
		target.RetrievalSource == nil &&
		target.Model == nil &&
		target.PromptVersionID == nil &&
		target.ExperimentRunID == nil &&
		len(target.Attributes) == 0
}

func onlinePolicyTargetMatchesProjection(target contracts.OnlinePolicyTarget, projection contracts.OnlinePolicyProjectionReadModel) bool {
	if !optionalStringEquals(target.AgentID, projection.AgentID) ||
		!optionalStringEquals(target.AgentName, projection.AgentName) ||
		!optionalStringEquals(target.Environment, projection.Environment) ||
		!optionalStringEquals(target.ServiceName, projection.ServiceName) ||
		!optionalStringEquals(target.Route, projection.Route) ||
		!optionalStringEquals(target.ToolName, projection.ToolName) ||
		!optionalStringEquals(target.RetrievalSource, projection.RetrievalSource) ||
		!optionalStringEquals(target.Model, projection.Model) ||
		!optionalStringEquals(target.PromptVersionID, projection.PromptVersionID) ||
		!optionalStringEquals(target.ExperimentRunID, projection.ExperimentRunID) {
		return false
	}
	if target.RoutePrefix != nil {
		if projection.Route == nil || !strings.HasPrefix(*projection.Route, *target.RoutePrefix) {
			return false
		}
	}
	for _, filter := range target.Attributes {
		if !onlineAttributeFilterMatches(projection.SafeAttributes, filter) {
			return false
		}
	}
	return true
}

func optionalStringEquals(want *string, got *string) bool {
	if want == nil {
		return true
	}
	return got != nil && *got == *want
}

func onlineAttributeFilters(value any) []contracts.OnlinePolicyAttributeFilter {
	rows := mapSlice(value)
	filters := make([]contracts.OnlinePolicyAttributeFilter, 0, len(rows))
	for _, row := range rows {
		key := aiEvalStringValue(row, "key", "")
		operator := aiEvalStringValue(row, "operator", "")
		if key == "" || operator == "" {
			continue
		}
		filters = append(filters, contracts.OnlinePolicyAttributeFilter{
			Key:      key,
			Operator: contracts.AttributeFilterOperator(operator),
			Value:    row["value"],
		})
	}
	return filters
}

func onlineAttributeFilterMatches(attributes map[string]any, filter contracts.OnlinePolicyAttributeFilter) bool {
	value, exists := attributes[filter.Key]
	switch string(filter.Operator) {
	case "exists":
		return exists
	case "eq":
		return exists && fmt.Sprint(value) == fmt.Sprint(filter.Value)
	case "neq":
		return !exists || fmt.Sprint(value) != fmt.Sprint(filter.Value)
	case "contains":
		return exists && strings.Contains(fmt.Sprint(value), fmt.Sprint(filter.Value))
	case "in":
		return valueInList(value, filter.Value)
	case "not_in":
		return !valueInList(value, filter.Value)
	default:
		return false
	}
}

func valueInList(value any, list any) bool {
	for _, candidate := range anySlice(list) {
		if fmt.Sprint(candidate) == fmt.Sprint(value) {
			return true
		}
	}
	return false
}

func anySlice(value any) []any {
	if values, ok := value.([]any); ok {
		return values
	}
	return nil
}

func optionalStringFromMap(values map[string]any, key string) *string {
	value, ok := stringInput(values, key)
	if !ok {
		return nil
	}
	return &value
}

func objectMap(value any) map[string]any {
	if values, ok := value.(map[string]any); ok && values != nil {
		return values
	}
	return map[string]any{}
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
