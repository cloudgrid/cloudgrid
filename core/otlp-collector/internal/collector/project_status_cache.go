package collector

import (
	"context"
	"strings"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	defaultProjectStatusTTL          = 60 * time.Second
	defaultProjectStatusMaxStaleness = 120 * time.Second
)

type ProjectStatusSnapshot struct {
	CompanyID string
	ProjectID string
	Status    contracts.ProjectStatus
	ChangedAt time.Time
	CachedAt  time.Time
}

type ProjectStatusSnapshotSource interface {
	Snapshot(ctx context.Context, companyID string, projectID string) (ProjectStatusSnapshot, error)
}

type ProjectStatusCacheOptions struct {
	TTL          time.Duration
	MaxStaleness time.Duration
	Now          func() time.Time
	Source       ProjectStatusSnapshotSource
}

type ProjectStatusCache struct {
	mu           sync.RWMutex
	entries      map[string]ProjectStatusSnapshot
	ttl          time.Duration
	maxStaleness time.Duration
	now          func() time.Time
	source       ProjectStatusSnapshotSource
}

func NewProjectStatusCache(options ProjectStatusCacheOptions) *ProjectStatusCache {
	ttl := options.TTL
	if ttl <= 0 {
		ttl = defaultProjectStatusTTL
	}
	maxStaleness := options.MaxStaleness
	if maxStaleness <= 0 {
		maxStaleness = defaultProjectStatusMaxStaleness
	}
	now := options.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &ProjectStatusCache{
		entries:      map[string]ProjectStatusSnapshot{},
		ttl:          ttl,
		maxStaleness: maxStaleness,
		now:          now,
		source:       options.Source,
	}
}

func (cache *ProjectStatusCache) Set(snapshot ProjectStatusSnapshot) {
	if cache == nil {
		return
	}
	snapshot.CompanyID = strings.TrimSpace(snapshot.CompanyID)
	snapshot.ProjectID = strings.TrimSpace(snapshot.ProjectID)
	if snapshot.CachedAt.IsZero() {
		snapshot.CachedAt = cache.now()
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	cache.entries[projectStatusKey(snapshot.CompanyID, snapshot.ProjectID)] = snapshot
}

func (cache *ProjectStatusCache) Refresh(ctx context.Context, companyID string, projectID string) error {
	if cache == nil || cache.source == nil {
		return nil
	}
	snapshot, err := cache.source.Snapshot(ctx, companyID, projectID)
	if err != nil {
		return err
	}
	cache.Set(snapshot)
	return nil
}

func (cache *ProjectStatusCache) AllowsIngest(companyID string, projectID string, checkedAt time.Time) bool {
	if cache == nil {
		return false
	}
	cache.mu.RLock()
	snapshot, ok := cache.entries[projectStatusKey(companyID, projectID)]
	cache.mu.RUnlock()
	if !ok {
		return false
	}
	if snapshot.Status != contracts.ProjectStatusActive {
		return false
	}
	if snapshot.CachedAt.IsZero() {
		return false
	}
	return checkedAt.Sub(snapshot.CachedAt) <= cache.maxStaleness
}

func (cache *ProjectStatusCache) TTL() time.Duration {
	if cache == nil {
		return defaultProjectStatusTTL
	}
	return cache.ttl
}

func (cache *ProjectStatusCache) MaxStaleness() time.Duration {
	if cache == nil {
		return defaultProjectStatusMaxStaleness
	}
	return cache.maxStaleness
}

func projectStatusKey(companyID string, projectID string) string {
	return strings.TrimSpace(companyID) + "/" + strings.TrimSpace(projectID)
}
