package surrealdb

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
)

type retryableState struct {
	mu         sync.RWMutex
	isDegraded bool
}

func newRetryableState() *retryableState {
	return &retryableState{}
}

func (state *retryableState) operationReady() error {
	if state == nil {
		return nil
	}
	state.mu.RLock()
	degraded := state.isDegraded
	state.mu.RUnlock()
	if degraded {
		return storageUnavailableError()
	}
	return nil
}

func (state *retryableState) observeOperationError(err error) error {
	if err == nil {
		return nil
	}
	if isRetryableSurrealDBError(err) {
		state.markDegraded()
		return storageUnavailableError()
	}
	return err
}

func (state *retryableState) markDegraded() {
	if state == nil {
		return
	}
	state.mu.Lock()
	state.isDegraded = true
	state.mu.Unlock()
}

func (state *retryableState) markReady() {
	if state == nil {
		return
	}
	state.mu.Lock()
	state.isDegraded = false
	state.mu.Unlock()
}

func (state *retryableState) degraded() bool {
	if state == nil {
		return false
	}
	state.mu.RLock()
	defer state.mu.RUnlock()
	return state.isDegraded
}

type sdkOperationLock struct {
	once sync.Once
	ch   chan struct{}
}

func newSDKOperationLock() *sdkOperationLock {
	return &sdkOperationLock{}
}

func (lock *sdkOperationLock) acquire(ctx context.Context) (func(), error) {
	if lock == nil {
		return func() {}, nil
	}
	lock.once.Do(func() {
		lock.ch = make(chan struct{}, 1)
	})
	select {
	case lock.ch <- struct{}{}:
		return func() { <-lock.ch }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func storageUnavailableError() error {
	return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB connection is unavailable")
}

func isRetryableSurrealDBError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, io.EOF) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	message := strings.ToLower(err.Error())
	for _, needle := range []string{
		"already closed",
		"broken pipe",
		"closed client",
		"closed network connection",
		"connection refused",
		"connection reset",
		"connection timeout",
		"connection was closed",
		"context deadline exceeded",
		"database unavailable",
		"i/o timeout",
		"not connected",
		"session expired",
		"timeout",
		"token expired",
		"transport is closing",
		"unavailable",
		"use of closed network connection",
		"websocket connection closed",
	} {
		if strings.Contains(message, needle) {
			return true
		}
	}
	return false
}
