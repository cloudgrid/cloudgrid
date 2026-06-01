package ports

import (
	"context"
	"time"
)

type SecretScope struct {
	Scope      string
	CompanyID  string
	ProjectID  string
	ProviderID string
}

type ManagedSecretWrite struct {
	ID              string
	Scope           SecretScope
	Value           string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	UpdatedByUserID string
}

type ResolvedSecret struct {
	Value string
}

type SecretStore interface {
	PutManagedSecret(ctx context.Context, secret ManagedSecretWrite) error
	ResolveManagedSecret(ctx context.Context, secretID string, scope SecretScope) (ResolvedSecret, bool, error)
	DeleteManagedSecret(ctx context.Context, secretID string, scope SecretScope) error
}

type UnavailableSecretStore struct{}

func (UnavailableSecretStore) PutManagedSecret(context.Context, ManagedSecretWrite) error {
	return ErrSecretStoreUnavailable
}

func (UnavailableSecretStore) ResolveManagedSecret(context.Context, string, SecretScope) (ResolvedSecret, bool, error) {
	return ResolvedSecret{}, false, ErrSecretStoreUnavailable
}

func (UnavailableSecretStore) DeleteManagedSecret(context.Context, string, SecretScope) error {
	return ErrSecretStoreUnavailable
}
