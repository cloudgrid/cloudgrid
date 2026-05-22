//go:build surrealdb

package surrealdb

import (
	"context"
	"strings"
	"sync"

	sdk "github.com/surrealdb/surrealdb.go"
)

type Client struct {
	db                 *sdk.DB
	initializedTargets map[string]bool
	mu                 sync.Mutex
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
	db, err := sdk.FromEndpointURLString(ctx, SDKEndpointURL(cfg.URL))
	if err != nil {
		return nil, err
	}

	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, err
	}

	if cfg.HasCredentials() {
		token, err := db.SignIn(ctx, &sdk.Auth{
			Username: cfg.Username,
			Password: cfg.Password,
		})
		if err != nil {
			_ = db.Close(ctx)
			return nil, err
		}
		if err := db.Authenticate(ctx, token); err != nil {
			_ = db.Close(ctx)
			return nil, err
		}
	}

	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, err
	}

	return &Client{db: db, initializedTargets: map[string]bool{}}, nil
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
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return err
	}
	return c.QueryInTarget(ctx, target, sql, vars)
}

func (c *Client) QueryInTarget(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return err
	}
	if err := c.ensureSchemaLocked(ctx, target); err != nil {
		return err
	}
	_, err := sdk.Query[any](ctx, c.db, sql, vars)
	return err
}

func (c *Client) QueryRowsInTarget(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) ([]map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return nil, err
	}
	if err := c.ensureSchemaLocked(ctx, target); err != nil {
		return nil, err
	}
	results, err := sdk.Query[[]map[string]any](ctx, c.db, sql, vars)
	if err != nil {
		return nil, err
	}
	if results == nil || len(*results) == 0 {
		return []map[string]any{}, nil
	}
	if (*results)[0].Error != nil {
		return nil, (*results)[0].Error
	}
	return (*results)[0].Result, nil
}

func (c *Client) IngestCommandExistsInTarget(ctx context.Context, target TelemetryTarget, commandID string) (bool, error) {
	type ingestCommand struct {
		CommandID string `json:"commandId"`
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return false, err
	}
	if err := c.ensureSchemaLocked(ctx, target); err != nil {
		return false, err
	}
	results, err := sdk.Query[[]ingestCommand](ctx, c.db, "SELECT commandId FROM ingest_command WHERE commandId = $commandId LIMIT 1;", map[string]any{
		"commandId": commandID,
	})
	if err != nil {
		return false, err
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
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return err
	}
	if err := c.executeSchemaLocked(ctx); err != nil {
		return err
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
