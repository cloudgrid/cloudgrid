//go:build surrealdb

package surrealdb

import (
	"context"
	"strings"

	sdk "github.com/surrealdb/surrealdb.go"
)

type Client struct {
	db                 *sdk.DB
	cfg                Config
	initializedTargets map[string]bool
	lock               *sdkOperationLock
	state              *retryableState
}

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

func Connect(ctx context.Context, cfg Config) (*Client, error) {
	db, err := openSDKDB(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &Client{db: db, cfg: cfg, initializedTargets: map[string]bool{}, lock: newSDKOperationLock(), state: newRetryableState()}, nil
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

func (c *Client) Query(ctx context.Context, sql string, vars map[string]any) error {
	if strings.EqualFold(strings.TrimSpace(sql), "INFO FOR DB;") || strings.EqualFold(strings.TrimSpace(sql), "INFO FOR DB") {
		return c.CheckReadiness(ctx)
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return err
	}
	return c.QueryInTarget(ctx, target, sql, vars)
}

func (c *Client) QueryInTarget(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) error {
	c.ensureRuntime()
	if err := c.state.operationReady(); err != nil {
		return err
	}
	release, err := c.lock.acquire(ctx)
	if err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	defer release()
	if c.db == nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use, schema setup, and Query are serialized per client.
	if err := c.ensureNamespaceDatabaseForTargetLocked(ctx, target); err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	if err := c.ensureSchemaLocked(ctx, target); err != nil {
		return c.state.observeOperationError(err)
	}
	_, err = sdk.Query[any](ctx, c.db, sql, vars)
	return c.state.observeOperationError(err)
}

func (c *Client) QueryRowsInTarget(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) ([]map[string]any, error) {
	c.ensureRuntime()
	if err := c.state.operationReady(); err != nil {
		return nil, err
	}
	release, err := c.lock.acquire(ctx)
	if err != nil {
		c.state.markDegraded()
		return nil, storageUnavailableError()
	}
	defer release()
	if c.db == nil {
		c.state.markDegraded()
		return nil, storageUnavailableError()
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use, schema setup, and Query are serialized per client.
	if err := c.ensureNamespaceDatabaseForTargetLocked(ctx, target); err != nil {
		return nil, c.state.observeOperationError(err)
	}
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return nil, c.state.observeOperationError(err)
	}
	if err := c.ensureSchemaLocked(ctx, target); err != nil {
		return nil, c.state.observeOperationError(err)
	}
	results, err := sdk.Query[[]map[string]any](ctx, c.db, sql, vars)
	if err != nil {
		return nil, c.state.observeOperationError(err)
	}
	if results == nil || len(*results) == 0 {
		return []map[string]any{}, nil
	}
	if (*results)[0].Error != nil {
		return nil, c.state.observeOperationError((*results)[0].Error)
	}
	return (*results)[0].Result, nil
}

func (c *Client) IngestCommandExistsInTarget(ctx context.Context, target TelemetryTarget, commandID string) (bool, error) {
	type ingestCommand struct {
		CommandID string `json:"commandId"`
	}

	c.ensureRuntime()
	if err := c.state.operationReady(); err != nil {
		return false, err
	}
	release, err := c.lock.acquire(ctx)
	if err != nil {
		c.state.markDegraded()
		return false, storageUnavailableError()
	}
	defer release()
	if c.db == nil {
		c.state.markDegraded()
		return false, storageUnavailableError()
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use, schema setup, and Query are serialized per client.
	if err := c.ensureNamespaceDatabaseForTargetLocked(ctx, target); err != nil {
		return false, c.state.observeOperationError(err)
	}
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return false, c.state.observeOperationError(err)
	}
	if err := c.ensureSchemaLocked(ctx, target); err != nil {
		return false, c.state.observeOperationError(err)
	}
	results, err := sdk.Query[[]ingestCommand](ctx, c.db, "SELECT commandId FROM ingest_command WHERE commandId = $commandId LIMIT 1;", map[string]any{
		"commandId": commandID,
	})
	if err != nil {
		return false, c.state.observeOperationError(err)
	}
	if results == nil || len(*results) == 0 {
		return false, nil
	}
	return len((*results)[0].Result) > 0, nil
}

func (c *Client) ensureSchemaLocked(ctx context.Context, target TelemetryTarget) error {
	key := target.Namespace + "/" + target.Database
	if c.initializedTargets == nil {
		c.initializedTargets = map[string]bool{}
	}
	if c.initializedTargets[key] {
		return nil
	}
	if err := c.executeSchemaLocked(ctx); err != nil {
		return err
	}
	c.initializedTargets[key] = true
	return nil
}

func (c *Client) InitializeSchema(ctx context.Context) error {
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return err
	}
	c.ensureRuntime()
	release, err := c.lock.acquire(ctx)
	if err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	defer release()
	if c.db == nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use and schema setup are serialized per client.
	if err := c.ensureNamespaceDatabaseForTargetLocked(ctx, target); err != nil {
		return c.state.observeOperationError(err)
	}
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return c.state.observeOperationError(err)
	}
	if err := c.executeSchemaLocked(ctx); err != nil {
		return c.state.observeOperationError(err)
	}
	key := target.Namespace + "/" + target.Database
	if c.initializedTargets == nil {
		c.initializedTargets = map[string]bool{}
	}
	c.initializedTargets[key] = true
	return nil
}

func (c *Client) executeSchemaLocked(ctx context.Context) error {
	for _, statement := range Statements() {
		if _, err := sdk.Query[any](ctx, c.db, statement+";", map[string]any{}); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) Close(ctx context.Context) error {
	return c.db.Close(ctx)
}

func (c *Client) CheckReadiness(ctx context.Context) error {
	c.ensureRuntime()
	wasDegraded := c.state.degraded()
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return err
	}
	release, err := c.lock.acquire(ctx)
	if err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	defer release()
	if c.db == nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	if wasDegraded && c.cfg.URL != "" {
		next, err := openSDKDB(ctx, c.cfg)
		if err != nil {
			c.state.markDegraded()
			return storageUnavailableError()
		}
		previous := c.db
		c.db = next
		if previous != nil {
			_ = previous.Close(context.Background())
		}
	}
	if err := c.ensureNamespaceDatabaseForTargetLocked(ctx, target); err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return c.state.observeOperationError(err)
	}
	if wasDegraded {
		// Storage-write owns telemetry schema initialization. These statements are
		// idempotent and rerun only after a degraded dependency state, before
		// readiness is restored.
		if err := c.executeSchemaLocked(ctx); err != nil {
			c.state.markDegraded()
			return storageUnavailableError()
		}
		key := target.Namespace + "/" + target.Database
		if c.initializedTargets == nil {
			c.initializedTargets = map[string]bool{}
		}
		c.initializedTargets[key] = true
	}
	results, err := sdk.Query[any](ctx, c.db, "INFO FOR DB;", map[string]any{})
	if err != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	if results == nil || len(*results) == 0 {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	if (*results)[0].Error != nil {
		c.state.markDegraded()
		return storageUnavailableError()
	}
	c.state.markReady()
	return nil
}

func (c *Client) ensureNamespaceDatabaseForTargetLocked(ctx context.Context, target TelemetryTarget) error {
	key := target.Namespace + "/" + target.Database
	if c.initializedTargets != nil && c.initializedTargets[key] {
		return nil
	}
	return ensureNamespaceDatabase(ctx, c.db, target.Namespace, target.Database)
}

func ensureNamespaceDatabase(ctx context.Context, db *sdk.DB, namespace string, database string) error {
	sql := "DEFINE NAMESPACE IF NOT EXISTS `" + escapeIdent(namespace) + "`; USE NS `" + escapeIdent(namespace) + "`; DEFINE DATABASE IF NOT EXISTS `" + escapeIdent(database) + "`;"
	_, err := sdk.Query[any](ctx, db, sql, map[string]any{})
	return err
}

func escapeIdent(value string) string {
	return strings.ReplaceAll(value, "`", "\\`")
}

func (c *Client) ensureRuntime() {
	if c.lock == nil {
		c.lock = newSDKOperationLock()
	}
	if c.state == nil {
		c.state = newRetryableState()
	}
}
