//go:build surrealdb

package main

import (
	"context"
	"fmt"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/adapters/surrealdb"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/config"
)

func newTelemetryWriteAdapter(ctx context.Context, cfg config.Config) (telemetryWriteAdapter, error) {
	if cfg.StorageAdapter != config.AdapterSurrealDB {
		return telemetryWriteAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: storage-write binary was built with adapter %q but CLOUDGRID_STORAGE_ADAPTER=%q", config.AdapterSurrealDB, cfg.StorageAdapter)
	}

	db, err := surrealdb.Connect(ctx, surrealdb.Config{
		URL:       cfg.SurrealDB.URL,
		Namespace: cfg.SurrealDB.Namespace,
		Database:  cfg.SurrealDB.Database,
		Username:  cfg.SurrealDB.Username,
		Password:  cfg.SurrealDB.Password,
	})
	if err != nil {
		return telemetryWriteAdapter{}, err
	}

	return telemetryWriteAdapter{
		Name:  config.AdapterSurrealDB,
		Store: surrealdb.Persister{DB: db},
		Initialize: func(ctx context.Context) error {
			return surrealdb.Initialize(ctx, db)
		},
		CheckReadiness: func(ctx context.Context) error {
			return db.Query(ctx, "INFO FOR DB;", map[string]any{})
		},
		Close: db.Close,
	}, nil
}
