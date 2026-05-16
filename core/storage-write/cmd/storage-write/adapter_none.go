//go:build !surrealdb

package main

import (
	"context"
	"fmt"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/config"
)

func newTelemetryWriteAdapter(_ context.Context, cfg config.Config) (telemetryWriteAdapter, error) {
	return telemetryWriteAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: storage-write binary was built with adapter %q but CLOUDGRID_STORAGE_ADAPTER=%q", "none", cfg.StorageAdapter)
}
