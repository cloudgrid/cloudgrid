//go:build surrealdb

package surrealdb

import (
	"context"
	"sync"

	sdk "github.com/surrealdb/surrealdb.go"
)

type readClientManager struct {
	cfg   Config
	db    *sdk.DB
	lock  *sdkOperationLock
	state *retryableState
}

var readClientManagers = struct {
	sync.Mutex
	byHandle map[*sdk.DB]*readClientManager
}{byHandle: map[*sdk.DB]*readClientManager{}}

func registerReadClient(db *sdk.DB, cfg Config) {
	readClientManagers.Lock()
	readClientManagers.byHandle[db] = &readClientManager{
		cfg:   cfg,
		db:    db,
		lock:  newSDKOperationLock(),
		state: newRetryableState(),
	}
	readClientManagers.Unlock()
}

func managerForDB(db *sdk.DB) *readClientManager {
	readClientManagers.Lock()
	manager := readClientManagers.byHandle[db]
	readClientManagers.Unlock()
	return manager
}

func Close(ctx context.Context, db *sdk.DB) error {
	manager := managerForDB(db)
	if manager == nil {
		return db.Close(ctx)
	}
	return manager.close(ctx)
}

func (manager *readClientManager) checkReadiness(ctx context.Context) error {
	if manager.state.degraded() {
		if err := manager.reconnect(ctx); err != nil {
			return manager.state.observeOperationError(err)
		}
	}
	release, err := manager.lock.acquire(ctx)
	if err != nil {
		manager.state.markDegraded()
		return storageUnavailableError()
	}
	defer release()
	if manager.db == nil {
		manager.state.markDegraded()
		return storageUnavailableError()
	}
	if err := checkReadinessWithDB(ctx, manager.db); err != nil {
		return manager.state.observeOperationError(err)
	}
	manager.state.markReady()
	return nil
}

func (manager *readClientManager) close(ctx context.Context) error {
	release, err := manager.lock.acquire(ctx)
	if err != nil {
		return storageUnavailableError()
	}
	defer release()
	if manager.db == nil {
		return nil
	}
	current := manager.db
	manager.db = nil
	readClientManagers.Lock()
	for handle, registered := range readClientManagers.byHandle {
		if registered == manager {
			delete(readClientManagers.byHandle, handle)
		}
	}
	readClientManagers.Unlock()
	return current.Close(ctx)
}

func (manager *readClientManager) reconnect(ctx context.Context) error {
	next, err := openSDKDB(ctx, manager.cfg)
	if err != nil {
		return err
	}
	release, err := manager.lock.acquire(ctx)
	if err != nil {
		_ = next.Close(context.Background())
		return err
	}
	previous := manager.db
	manager.db = next
	release()
	if previous != nil {
		_ = previous.Close(context.Background())
	}
	return nil
}

func queryRowsWithManager[T any](ctx context.Context, manager *readClientManager, stmt QueryStatement) ([]T, error) {
	if err := manager.state.operationReady(); err != nil {
		return nil, err
	}
	release, err := manager.lock.acquire(ctx)
	if err != nil {
		manager.state.markDegraded()
		return nil, storageUnavailableError()
	}
	defer release()
	if manager.db == nil {
		manager.state.markDegraded()
		return nil, storageUnavailableError()
	}
	// The SurrealDB SDK client keeps namespace/database selection as mutable
	// connection state, so Use and Query are serialized per adapter manager.
	if stmt.Target.Namespace != "" || stmt.Target.Database != "" {
		if err := manager.db.Use(ctx, stmt.Target.Namespace, stmt.Target.Database); err != nil {
			return nil, manager.state.observeOperationError(err)
		}
	}
	results, err := sdk.Query[[]T](ctx, manager.db, stmt.SQL, stmt.Params)
	if err != nil {
		return nil, manager.state.observeOperationError(err)
	}
	if results == nil || len(*results) == 0 {
		return nil, manager.state.observeOperationError(storageUnavailableError())
	}
	result := (*results)[0]
	if result.Error != nil {
		return nil, manager.state.observeOperationError(result.Error)
	}
	if result.Result == nil {
		return []T{}, nil
	}
	return result.Result, nil
}
