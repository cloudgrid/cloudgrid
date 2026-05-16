//go:build !surrealdb

package main

import (
	"context"
	"fmt"

	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
)

func newTelemetryReadAdapter(_ context.Context, cfg storage.Config) (telemetryReadAdapter, error) {
	return telemetryReadAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: storage-read binary was built with adapter \"none\" but CLOUDGRID_STORAGE_ADAPTER=%q; rebuild with -tags %s", cfg.StorageAdapter, cfg.StorageAdapter)
}
