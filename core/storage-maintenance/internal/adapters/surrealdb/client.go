//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"strings"
	"sync"

	sdk "github.com/surrealdb/surrealdb.go"
)

type Config struct {
	URL       string
	Namespace string
	Database  string
	Username  string
	Password  string
}

type ControlTarget struct {
	Namespace string
	Database  string
}

type TelemetryTarget struct {
	Namespace string
	Database  string
	TenantID  string
	CompanyID string
	ProjectID string
}

type Client struct {
	db *sdk.DB
	mu sync.Mutex
}

func Connect(ctx context.Context, cfg Config) (*Client, error) {
	db, err := sdk.FromEndpointURLString(ctx, SDKEndpointURL(cfg.URL))
	if err != nil {
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB connection failed")
	}
	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB namespace/database selection failed")
	}
	if cfg.Username != "" {
		token, err := db.SignIn(ctx, sdk.Auth{
			Username: cfg.Username,
			Password: cfg.Password,
		})
		if err != nil {
			_ = db.Close(ctx)
			return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB authentication failed")
		}
		if err := db.Authenticate(ctx, token); err != nil {
			_ = db.Close(ctx)
			return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB authentication failed")
		}
	}
	return &Client{db: db}, nil
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
	c.mu.Lock()
	defer c.mu.Unlock()
	_, err := sdk.Query[any](ctx, c.db, sql, vars)
	return err
}

func (c *Client) queryRowsInTarget(ctx context.Context, target ControlTarget, sql string, vars map[string]any) ([]map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return nil, err
	}
	results, err := sdk.Query[[]map[string]any](ctx, c.db, sql, vars)
	if err != nil {
		return nil, err
	}
	return firstRows(results)
}

func (c *Client) execInTarget(ctx context.Context, target ControlTarget, sql string, vars map[string]any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return err
	}
	_, err := sdk.Query[any](ctx, c.db, sql, vars)
	return err
}

func (c *Client) queryTelemetry(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.db.Use(ctx, target.Namespace, target.Database); err != nil {
		return nil, err
	}
	results, err := sdk.Query[map[string]any](ctx, c.db, sql, vars)
	if err != nil {
		return nil, err
	}
	if results == nil || len(*results) == 0 {
		return nil, fmt.Errorf("empty SurrealDB query result")
	}
	result := (*results)[len(*results)-1]
	if result.Error != nil {
		return nil, result.Error
	}
	return result.Result, nil
}

func (c *Client) Close(ctx context.Context) error {
	return c.db.Close(ctx)
}

func (c *Client) RawDB() *sdk.DB {
	return c.db
}

func queryOne[T any](ctx context.Context, db *sdk.DB, sql string, vars map[string]any) (T, error) {
	var zero T
	results, err := sdk.Query[T](ctx, db, sql, vars)
	if err != nil {
		return zero, err
	}
	if results == nil || len(*results) == 0 {
		return zero, fmt.Errorf("empty SurrealDB query result")
	}
	result := (*results)[0]
	if result.Error != nil {
		return zero, result.Error
	}
	return result.Result, nil
}

func firstRows(results *[]sdk.QueryResult[[]map[string]any]) ([]map[string]any, error) {
	if results == nil || len(*results) == 0 {
		return nil, fmt.Errorf("empty SurrealDB query result")
	}
	result := (*results)[0]
	if result.Error != nil {
		return nil, result.Error
	}
	if result.Result == nil {
		return []map[string]any{}, nil
	}
	return result.Result, nil
}
