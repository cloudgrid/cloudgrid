package surrealdb

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	sdk "github.com/surrealdb/surrealdb.go"
)

type Config struct {
	URL       string
	Namespace string
	Database  string
	Username  string
	Password  string
}

func (cfg Config) HasCredentials() bool {
	return cfg.Username != "" && cfg.Password != ""
}

type Client struct {
	db                *sdk.DB
	cfg               Config
	namespace         string
	database          string
	lock              *sdkOperationLock
	state             *retryableState
	execOverride      func(context.Context, string, map[string]any) error
	queryRowsOverride func(context.Context, QueryStatement) (any, error)
	queryOneOverride  func(context.Context, string, map[string]any) (any, error)
	traceRecorder     selfobs.SpanRecorder
}

func Connect(ctx context.Context, cfg Config) (*Client, error) {
	db, err := openSDKDB(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &Client{db: db, cfg: cfg, namespace: cfg.Namespace, database: cfg.Database, lock: newSDKOperationLock(), state: newRetryableState()}, nil
}

func openSDKDB(ctx context.Context, cfg Config) (*sdk.DB, error) {
	db, err := sdk.FromEndpointURLString(ctx, SDKEndpointURL(cfg.URL))
	if err != nil {
		return nil, storageUnavailableError()
	}
	if cfg.HasCredentials() {
		token, err := db.SignIn(ctx, &sdk.Auth{
			Username: cfg.Username,
			Password: cfg.Password,
		})
		if err != nil {
			_ = db.Close(ctx)
			return nil, storageUnavailableError()
		}
		if err := db.Authenticate(ctx, token); err != nil {
			_ = db.Close(ctx)
			return nil, storageUnavailableError()
		}
	}
	if err := ensureNamespaceDatabase(ctx, db, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, storageUnavailableError()
	}
	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, storageUnavailableError()
	}
	return db, nil
}

func SDKEndpointURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(trimmed, "http://") {
		return "ws://" + strings.TrimPrefix(trimmed, "http://")
	}
	if strings.HasPrefix(trimmed, "https://") {
		return "wss://" + strings.TrimPrefix(trimmed, "https://")
	}
	return trimmed
}

func ensureNamespaceDatabase(ctx context.Context, db *sdk.DB, namespace string, database string) error {
	sql := fmt.Sprintf(
		"DEFINE NAMESPACE IF NOT EXISTS `%s`; USE NS `%s`; DEFINE DATABASE IF NOT EXISTS `%s`;",
		escapeIdent(namespace),
		escapeIdent(namespace),
		escapeIdent(database),
	)
	_, err := sdk.Query[any](ctx, db, sql, map[string]any{})
	return err
}

func escapeIdent(value string) string {
	return strings.ReplaceAll(value, "`", "\\`")
}

func (client *Client) ApplySchema(ctx context.Context) error {
	for _, statement := range BuildSchemaStatements() {
		if err := client.exec(ctx, statement, nil); err != nil {
			return err
		}
	}
	return nil
}

func (client *Client) CheckReadiness(ctx context.Context) error {
	client.ensureRuntime()
	wasDegraded := client.state.degraded()
	if client.queryOneOverride != nil {
		if wasDegraded {
			for _, statement := range BuildSchemaStatements() {
				if err := client.execOverrideOrNoop(ctx, statement, nil); err != nil {
					client.state.markDegraded()
					return storageUnavailableError()
				}
			}
		}
		row, err := client.queryOneOverride(ctx, "INFO FOR DB;", nil)
		if err != nil {
			client.state.markDegraded()
			return storageUnavailableError()
		}
		info, ok := row.(DatabaseInfo)
		if !ok {
			return fmt.Errorf("test query one override returned %T, want T", row)
		}
		if err := CheckSchemaReadiness(info); err != nil {
			return err
		}
		client.state.markReady()
		return nil
	}

	release, err := client.lock.acquire(ctx)
	if err != nil {
		client.state.markDegraded()
		return storageUnavailableError()
	}
	defer release()
	if client.db == nil {
		client.state.markDegraded()
		return storageUnavailableError()
	}
	if wasDegraded && client.cfg.URL != "" {
		next, err := openSDKDB(ctx, client.cfg)
		if err != nil {
			client.state.markDegraded()
			return storageUnavailableError()
		}
		previous := client.db
		client.db = next
		if previous != nil {
			_ = previous.Close(context.Background())
		}
	}
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		client.state.markDegraded()
		return storageUnavailableError()
	}
	if wasDegraded {
		// Control-plane owns these idempotent schema statements; rerun them only
		// after a degraded dependency state before readiness is restored.
		for _, statement := range BuildSchemaStatements() {
			if results, err := sdk.Query[any](ctx, client.db, statement, nil); err != nil {
				client.state.markDegraded()
				return storageUnavailableError()
			} else if results != nil {
				for _, result := range *results {
					if result.Error != nil {
						client.state.markDegraded()
						return storageUnavailableError()
					}
				}
			}
		}
	}
	results, err := sdk.Query[DatabaseInfo](ctx, client.db, "INFO FOR DB;", nil)
	if err != nil {
		client.state.markDegraded()
		return storageUnavailableError()
	}
	if results == nil || len(*results) == 0 {
		client.state.markDegraded()
		return storageUnavailableError()
	}
	if (*results)[0].Error != nil {
		client.state.markDegraded()
		return storageUnavailableError()
	}
	if err := CheckSchemaReadiness((*results)[0].Result); err != nil {
		return err
	}
	client.state.markReady()
	return nil
}

func (client *Client) Close(ctx context.Context) error {
	return client.db.Close(ctx)
}

func (client *Client) EnableDBAdapterTracing(recorder selfobs.SpanRecorder) {
	client.traceRecorder = recorder
}

func (client *Client) exec(ctx context.Context, sql string, vars map[string]any) error {
	endTrace := client.startDBAdapterSpan(ctx, "control-plane.db.mutation", "mutation", "transaction")
	var opErr error
	defer func() { endTrace(opErr) }()
	client.ensureRuntime()
	if err := client.state.operationReady(); err != nil {
		opErr = err
		return err
	}
	if client.execOverride != nil {
		if err := client.execOverride(ctx, sql, vars); err != nil {
			opErr = client.state.observeOperationError(err)
			return opErr
		}
		return nil
	}
	release, err := client.lock.acquire(ctx)
	if err != nil {
		client.state.markDegraded()
		opErr = storageUnavailableError()
		return opErr
	}
	defer release()
	if client.db == nil {
		client.state.markDegraded()
		opErr = storageUnavailableError()
		return opErr
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use and Query must be serialized per adapter client.
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		opErr = client.state.observeOperationError(err)
		return opErr
	}
	results, err := sdk.Query[any](ctx, client.db, sql, vars)
	if err != nil {
		opErr = client.state.observeOperationError(err)
		return opErr
	}
	if results != nil {
		for _, result := range *results {
			if result.Error != nil {
				opErr = client.state.observeOperationError(result.Error)
				return opErr
			}
		}
	}
	return nil
}

func queryRows[T any](ctx context.Context, client *Client, stmt QueryStatement) ([]T, error) {
	endTrace := client.startDBAdapterSpan(ctx, "control-plane.db.query", "query", "select")
	var opErr error
	defer func() { endTrace(opErr) }()
	client.ensureRuntime()
	if err := client.state.operationReady(); err != nil {
		opErr = err
		return nil, err
	}
	if client.queryRowsOverride != nil {
		rows, err := client.queryRowsOverride(ctx, stmt)
		if err != nil {
			opErr = client.state.observeOperationError(err)
			return nil, opErr
		}
		typed, ok := rows.([]T)
		if !ok {
			opErr = fmt.Errorf("test query rows override returned %T, want []T", rows)
			return nil, opErr
		}
		return typed, nil
	}
	release, err := client.lock.acquire(ctx)
	if err != nil {
		client.state.markDegraded()
		opErr = storageUnavailableError()
		return nil, opErr
	}
	defer release()
	if client.db == nil {
		client.state.markDegraded()
		opErr = storageUnavailableError()
		return nil, opErr
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use and Query must be serialized per adapter client.
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		opErr = client.state.observeOperationError(err)
		return nil, opErr
	}
	results, err := sdk.Query[[]T](ctx, client.db, stmt.SQL, stmt.Params)
	if err != nil {
		opErr = client.state.observeOperationError(err)
		return nil, opErr
	}
	if results == nil || len(*results) == 0 {
		return []T{}, nil
	}
	if (*results)[0].Error != nil {
		return nil, client.state.observeOperationError((*results)[0].Error)
	}
	return (*results)[0].Result, nil
}

func (client *Client) startDBAdapterSpan(ctx context.Context, spanName string, operation string, statementKind string) func(error) {
	return selfobs.StartDBAdapterSpan(ctx, client.traceRecorder, selfobs.DBAdapterSpanConfig{
		Enabled:       client.traceRecorder != nil,
		SpanName:      spanName,
		Adapter:       "surrealdb",
		Operation:     operation,
		TargetKind:    "control",
		StatementKind: statementKind,
		Attributes:    map[string]string{"db.system": "surrealdb"},
	})
}

func queryOne[T any](ctx context.Context, client *Client, sql string, vars map[string]any) (T, error) {
	var zero T
	client.ensureRuntime()
	if err := client.state.operationReady(); err != nil {
		return zero, err
	}
	if client.queryOneOverride != nil {
		row, err := client.queryOneOverride(ctx, sql, vars)
		if err != nil {
			return zero, client.state.observeOperationError(err)
		}
		typed, ok := row.(T)
		if !ok {
			return zero, fmt.Errorf("test query one override returned %T, want T", row)
		}
		return typed, nil
	}
	release, err := client.lock.acquire(ctx)
	if err != nil {
		client.state.markDegraded()
		return zero, storageUnavailableError()
	}
	defer release()
	if client.db == nil {
		client.state.markDegraded()
		return zero, storageUnavailableError()
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use and Query must be serialized per adapter client.
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		return zero, client.state.observeOperationError(err)
	}
	results, err := sdk.Query[T](ctx, client.db, sql, vars)
	if err != nil {
		return zero, client.state.observeOperationError(err)
	}
	if results == nil || len(*results) == 0 {
		return zero, fmt.Errorf("empty SurrealDB query result")
	}
	if (*results)[0].Error != nil {
		return zero, client.state.observeOperationError((*results)[0].Error)
	}
	return (*results)[0].Result, nil
}

func (client *Client) ensureRuntime() {
	if client.lock == nil {
		client.lock = newSDKOperationLock()
	}
	if client.state == nil {
		client.state = newRetryableState()
	}
}

func (client *Client) execOverrideOrNoop(ctx context.Context, sql string, vars map[string]any) error {
	if client.execOverride == nil {
		return nil
	}
	return client.execOverride(ctx, sql, vars)
}
