package surrealdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestControlPlaneRetryableStateDegradesAndRecovers(t *testing.T) {
	state := newRetryableState()

	err := state.observeOperationError(context.DeadlineExceeded)
	if err == nil || !strings.Contains(err.Error(), "ERR-006 STORAGE_UNAVAILABLE") {
		t.Fatalf("observeOperationError() = %v, want retryable ERR-006", err)
	}
	if !state.degraded() {
		t.Fatal("state should be degraded after retryable timeout")
	}
	if err := state.operationReady(); err == nil || !strings.Contains(err.Error(), "ERR-006 STORAGE_UNAVAILABLE") {
		t.Fatalf("operationReady() = %v, want fail-fast ERR-006 while degraded", err)
	}

	state.markReady()
	if state.degraded() {
		t.Fatal("state should recover after readiness succeeds")
	}
	if err := state.operationReady(); err != nil {
		t.Fatalf("operationReady() after recovery = %v", err)
	}
}

func TestControlPlaneSDKLockHonorsContextDeadline(t *testing.T) {
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
