//go:build surrealdb

package main

import (
	"context"

	maintenancesurreal "github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/adapters/surrealdb"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

const defaultStorageAdapter = "surrealdb"

type retentionStore interface {
	retention.Store
	retention.LeaseStore
}

func openRetentionStore(ctx context.Context, cfg config) (retentionStore, func(), error) {
	if cfg.StorageAdapter != "surrealdb" {
		return nil, func() {}, errConfigInvalid("storage-maintenance binary was built with surrealdb adapter but CLOUDGRID_STORAGE_ADAPTER=%q", cfg.StorageAdapter)
	}
	client, err := maintenancesurreal.Connect(ctx, maintenancesurreal.Config{
		URL:       cfg.SurrealDB.URL,
		Namespace: cfg.SurrealDB.Namespace,
		Database:  cfg.SurrealDB.Database,
		Username:  cfg.SurrealDB.Username,
		Password:  cfg.SurrealDB.Password,
	})
	if err != nil {
		return nil, func() {}, err
	}
	controlTarget := maintenancesurreal.ControlTarget{
		Namespace: cfg.SurrealDB.Namespace,
		Database:  cfg.SurrealDB.Database,
	}
	if err := maintenancesurreal.Initialize(ctx, client); err != nil {
		_ = client.Close(ctx)
		return nil, func() {}, err
	}
	if err := maintenancesurreal.CheckReadiness(ctx, client.RawDB(), controlTarget); err != nil {
		_ = client.Close(ctx)
		return nil, func() {}, err
	}
	store := maintenancesurreal.NewStore(client, controlTarget)
	return store, func() { _ = client.Close(context.Background()) }, nil
}
