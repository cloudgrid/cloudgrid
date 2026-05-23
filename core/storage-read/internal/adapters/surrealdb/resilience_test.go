//go:build surrealdb

package surrealdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestStorageReadRetryableStateDegradesAndRecovers(t *testing.T) {
	state := newRetryableState()

	err := state.observeOperationError(errors.New("websocket connection closed"))
	if err == nil || !strings.Contains(err.Error(), "ERR-006 STORAGE_UNAVAILABLE") {
		t.Fatalf("observeOperationError() = %v, want retryable ERR-006", err)
	}
	if !state.degraded() {
		t.Fatal("state should be degraded after closed-client error")
	}
	if err := state.operationReady(); err == nil || !strings.Contains(err.Error(), "ERR-006 STORAGE_UNAVAILABLE") {
		t.Fatalf("operationReady() = %v, want fail-fast ERR-006 while degraded", err)
	}

	state.markReady()
	if state.degraded() {
		t.Fatal("state should recover after readiness succeeds")
	}
}

func TestStorageReadReadinessDoesNotRunSchemaInitialization(t *testing.T) {
	calledInitialize := false
	manager := newReadinessManager(readinessManagerOptions{
		readiness: func(context.Context) error {
			return nil
		},
		initialize: func(context.Context) error {
			calledInitialize = true
			return nil
		},
	})

	if err := manager.check(context.Background()); err != nil {
		t.Fatalf("check() error = %v", err)
	}
	if calledInitialize {
		t.Fatal("storage-read readiness must not repair or initialize schema")
	}
}

func TestStorageReadSDKLockHonorsContextDeadline(t *testing.T) {
	lock := newSDKOperationLock()
	release, err := lock.acquire(context.Background())
	if err != nil {
		t.Fatalf("first acquire error = %v", err)
	}
	defer release()

	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	if _, err := lock.acquire(ctx); err == nil || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("contended acquire error = %v, want context deadline", err)
	}
}
