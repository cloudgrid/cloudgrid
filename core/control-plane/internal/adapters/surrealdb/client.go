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

func (cfg Config) HasCredentials() bool {
	return cfg.Username != "" && cfg.Password != ""
}

type Client struct {
	db                *sdk.DB
	namespace         string
	database          string
	mu                sync.Mutex
	execOverride      func(context.Context, string, map[string]any) error
	queryRowsOverride func(context.Context, QueryStatement) (any, error)
	queryOneOverride  func(context.Context, string, map[string]any) (any, error)
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
	return &Client{db: db, namespace: cfg.Namespace, database: cfg.Database}, nil
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

func (client *Client) ApplySchema(ctx context.Context) error {
	for _, statement := range BuildSchemaStatements() {
		if err := client.exec(ctx, statement, nil); err != nil {
			return err
		}
	}
	return nil
}

func (client *Client) CheckReadiness(ctx context.Context) error {
	info, err := queryOne[DatabaseInfo](ctx, client, "INFO FOR DB;", nil)
	if err != nil {
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB readiness check failed")
	}
	return CheckSchemaReadiness(info)
}

func (client *Client) Close(ctx context.Context) error {
	return client.db.Close(ctx)
}

func (client *Client) exec(ctx context.Context, sql string, vars map[string]any) error {
	if client.execOverride != nil {
		return client.execOverride(ctx, sql, vars)
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		return err
	}
	results, err := sdk.Query[any](ctx, client.db, sql, vars)
	if err != nil {
		return err
	}
	if results != nil {
		for _, result := range *results {
			if result.Error != nil {
				return result.Error
			}
		}
	}
	return nil
}

func queryRows[T any](ctx context.Context, client *Client, stmt QueryStatement) ([]T, error) {
	if client.queryRowsOverride != nil {
		rows, err := client.queryRowsOverride(ctx, stmt)
		if err != nil {
			return nil, err
		}
		typed, ok := rows.([]T)
		if !ok {
			return nil, fmt.Errorf("test query rows override returned %T, want []T", rows)
		}
		return typed, nil
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		return nil, err
	}
	results, err := sdk.Query[[]T](ctx, client.db, stmt.SQL, stmt.Params)
	if err != nil {
		return nil, err
	}
	if results == nil || len(*results) == 0 {
		return []T{}, nil
	}
	if (*results)[0].Error != nil {
		return nil, (*results)[0].Error
	}
	return (*results)[0].Result, nil
}

func queryOne[T any](ctx context.Context, client *Client, sql string, vars map[string]any) (T, error) {
	var zero T
	if client.queryOneOverride != nil {
		row, err := client.queryOneOverride(ctx, sql, vars)
		if err != nil {
			return zero, err
		}
		typed, ok := row.(T)
		if !ok {
			return zero, fmt.Errorf("test query one override returned %T, want T", row)
		}
		return typed, nil
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	if err := client.db.Use(ctx, client.namespace, client.database); err != nil {
		return zero, err
	}
	results, err := sdk.Query[T](ctx, client.db, sql, vars)
	if err != nil {
		return zero, err
	}
	if results == nil || len(*results) == 0 {
		return zero, fmt.Errorf("empty SurrealDB query result")
	}
	if (*results)[0].Error != nil {
		return zero, (*results)[0].Error
	}
	return (*results)[0].Result, nil
}
