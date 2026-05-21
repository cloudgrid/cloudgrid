//go:build surrealdb

package main

import (
	"context"
	"fmt"

	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/adapters/surrealdb"
)

func newTelemetryReadAdapter(ctx context.Context, cfg storage.Config) (telemetryReadAdapter, error) {
	if cfg.StorageAdapter != storage.AdapterSurrealDB {
		return telemetryReadAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: storage-read binary was built with adapter %q but CLOUDGRID_STORAGE_ADAPTER=%q", storage.AdapterSurrealDB, cfg.StorageAdapter)
	}
	surrealdb.ConfigureQueryLimits(cfg.Limits.MaxPageSize)
	surrealdb.ConfigureMetricLimits(cfg.Limits.MaxMetricPoints)

	db, err := surrealdb.Connect(ctx, surrealdb.Config{
		URL:       cfg.SurrealDB.URL,
		Namespace: cfg.SurrealDB.Namespace,
		Database:  cfg.SurrealDB.Database,
		Username:  cfg.SurrealDB.Username,
		Password:  cfg.SurrealDB.Password,
	})
	if err != nil {
		return telemetryReadAdapter{}, err
	}

	return telemetryReadAdapter{
		Name:  storage.AdapterSurrealDB,
		Store: surrealdb.Store{DB: db},
		CheckReadiness: func(ctx context.Context) error {
			return surrealdb.CheckReadiness(ctx, db)
		},
		Close: db.Close,
	}, nil
}
