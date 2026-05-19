//go:build !surrealdb

package main

import (
	"context"
	"fmt"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

const defaultStorageAdapter = "fixture"

type retentionStore interface {
	retention.Store
	retention.LeaseStore
}

func openRetentionStore(ctx context.Context, cfg config) (retentionStore, func(), error) {
	_ = ctx
	if cfg.StorageAdapter != "fixture" {
		return nil, func() {}, fmt.Errorf("ERR-009 CONFIG_INVALID: storage-maintenance binary was built with fixture adapter but CLOUDGRID_STORAGE_ADAPTER=%q", cfg.StorageAdapter)
	}
	return retention.NewFixtureStore(), func() {}, nil
}
