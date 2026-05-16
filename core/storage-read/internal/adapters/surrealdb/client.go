//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"strings"

	sdk "github.com/surrealdb/surrealdb.go"
)

type Config struct {
	URL       string
	Namespace string
	Database  string
	Username  string
	Password  string
}

func Connect(ctx context.Context, cfg Config) (*sdk.DB, error) {
	db, err := sdk.FromEndpointURLString(ctx, SDKEndpointURL(cfg.URL))
	if err != nil {
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB connection failed")
	}

	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB namespace/database selection failed")
	}

	if cfg.Username != "" {
		if _, err := db.SignIn(ctx, sdk.Auth{
			Username: cfg.Username,
			Password: cfg.Password,
		}); err != nil {
			_ = db.Close(ctx)
			return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB authentication failed")
		}
	}

	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB namespace/database selection failed")
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
