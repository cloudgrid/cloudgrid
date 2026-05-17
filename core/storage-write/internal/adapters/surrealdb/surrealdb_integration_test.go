//go:build surrealdb

package surrealdb

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	sdk "github.com/surrealdb/surrealdb.go"
)

func TestSurrealDBStorageWritePersistsAiEvalMutation(t *testing.T) {
	if os.Getenv("CLOUDGRID_ENABLE_SURREALDB_STORAGE_WRITE_TESTS") != "true" {
		t.Skip("set CLOUDGRID_ENABLE_SURREALDB_STORAGE_WRITE_TESTS=true to run SurrealDB storage-write integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := Connect(ctx, Config{
		URL:       integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_URL"), "http://localhost:8000/rpc"),
		Namespace: integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_NAMESPACE"), "cloudgrid_storage_write_test"),
		Database:  fmt.Sprintf("project_default_%d", time.Now().UnixNano()),
		Username:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_USERNAME"), "root"),
		Password:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD"), "root"),
	})
	if err != nil {
		t.Fatalf("connect SurrealDB: %v", err)
	}
	defer func() {
		_ = client.Close(context.Background())
	}()
	if err := Initialize(ctx, client); err != nil {
		t.Fatalf("initialize storage-write schema: %v", err)
	}

	persister := Persister{DB: client}
	runSuffix := fmt.Sprint(time.Now().UnixNano())
	data, err := persister.PersistEvalMutation(ctx, "eval.dataset.create", contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-dataset-integration-" + runSuffix,
			IssuedAt:  time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC),
		},
		Input: map[string]any{
			"name": "integration dataset",
			"tags": []any{"integration"},
		},
	}, time.Date(2026, 5, 17, 12, 0, 1, 0, time.UTC))
	if err != nil {
		t.Fatalf("PersistEvalMutation: %v", err)
	}
	if data["id"] == "" {
		t.Fatalf("PersistEvalMutation data = %#v, want generated id", data)
	}

	item, err := persister.PersistEvalMutation(ctx, "eval.dataset.items.append", contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-dataset-item-integration-" + runSuffix,
			IssuedAt:  time.Date(2026, 5, 17, 12, 0, 2, 0, time.UTC),
		},
		Input: map[string]any{
			"datasetId": data["id"],
			"version":   2,
			"items": []any{
				map[string]any{
					"id":           "dataset-item-integration",
					"input":        map[string]any{"prompt": "integration prompt"},
					"expected":     map[string]any{"answer": "ok"},
					"metadata":     map[string]any{"source": "integration"},
					"split":        "validation",
					"reviewStatus": "reviewed",
					"synthetic":    false,
				},
			},
		},
	}, time.Date(2026, 5, 17, 12, 0, 3, 0, time.UTC))
	if err != nil {
		t.Fatalf("PersistEvalMutation append: %v", err)
	}
	if item["id"] != "dataset-item-integration" {
		t.Fatalf("PersistEvalMutation append data = %#v", item)
	}
	datasetRows, err := queryIntegrationRows[map[string]any](ctx, client, "SELECT itemCount, version FROM ai_dataset WHERE record::id(id) = $datasetId LIMIT 1;", map[string]any{
		"datasetId": data["id"],
	})
	if err != nil {
		t.Fatalf("query dataset after append: %v", err)
	}
	if len(datasetRows) != 1 {
		t.Fatalf("dataset row count = %d, want 1", len(datasetRows))
	}
	if numericIntegrationValue(datasetRows[0]["itemCount"]) != 1 {
		t.Fatalf("dataset itemCount after append = %#v, want 1", datasetRows[0])
	}
	if numericIntegrationValue(datasetRows[0]["version"]) != 2 {
		t.Fatalf("dataset version after append = %#v, want 2", datasetRows[0])
	}

	aiCommand := validAIProjectionPersistCommand()
	aiCommand.CommandID = "cmd-ai-integration-" + runSuffix
	aiCommand.RequestID = "req-ai-integration-" + runSuffix
	aiCommand.AuthContext = nil
	aiCommand.Projection["agent"] = map[string]any{"id": "checkout-agent", "name": "checkout-agent", "version": "integration"}
	aiCommand.Projection["endedAt"] = "2026-05-17T12:00:04Z"
	aiCommand.Projection["durationMs"] = 5000
	aiCommand.Projection["tokenTotals"] = map[string]any{"input": 11, "output": 7, "total": 18}
	aiCommand.Projection["costEstimate"] = map[string]any{"amount": 0, "currency": "USD"}
	aiCommand.Projection["metadata"] = map[string]any{"source": "integration"}
	aiCommand.Projection["transcript"] = []any{
		map[string]any{
			"role":          "assistant",
			"content":       "ok",
			"contentDigest": "sha256:integration",
			"spanId":        "span-1",
			"timestamp":     "2026-05-17T12:00:04Z",
		},
	}
	aiCommand.Projection["llmCalls"] = []any{}
	aiCommand.Projection["toolCalls"] = []any{}
	aiCommand.Projection["retrievalEvents"] = []any{}
	aiCommand.Projection["evalResults"] = []any{}
	ids, err := persister.PersistAIProjection(ctx, aiCommand, "telemetry.ingest.ai_projections", time.Date(2026, 5, 17, 12, 0, 5, 0, time.UTC))
	if err != nil {
		t.Fatalf("PersistAIProjection: %v", err)
	}
	if len(ids) != 1 || ids[0] != "agent-run-1" {
		t.Fatalf("PersistAIProjection ids = %#v", ids)
	}
}

func integrationValueOrDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func queryIntegrationRows[T any](ctx context.Context, client *Client, sql string, vars map[string]any) ([]T, error) {
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return nil, err
	}
	if err := client.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return nil, err
	}
	results, err := sdk.Query[[]T](ctx, client.db, sql, vars)
	if err != nil {
		return nil, err
	}
	if results == nil || len(*results) == 0 {
		return nil, fmt.Errorf("empty SurrealDB query result")
	}
	result := (*results)[0]
	if result.Error != nil {
		return nil, result.Error
	}
	if result.Result == nil {
		return []T{}, nil
	}
	return result.Result, nil
}

func numericIntegrationValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case uint:
		return int(typed)
	case uint64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		result, _ := typed.Int64()
		return int(result)
	default:
		return 0
	}
}
