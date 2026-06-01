package surrealdb

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	sdk "github.com/surrealdb/surrealdb.go"
)

const algorithmAES256GCM = "aes-256-gcm"

type Config struct {
	URL           string
	Namespace     string
	Database      string
	Username      string
	Password      string
	EncryptionKey string
}

func (cfg Config) HasCredentials() bool {
	return cfg.Username != "" && cfg.Password != ""
}

type Store struct {
	db  *sdk.DB
	cfg Config
	key []byte
	mu  sync.Mutex
}

type secretRecord struct {
	ID              string `json:"id"`
	Scope           string `json:"scope"`
	CompanyID       string `json:"companyId"`
	ProjectID       string `json:"projectId"`
	ProviderID      string `json:"providerId"`
	Algorithm       string `json:"algorithm"`
	Nonce           string `json:"nonce"`
	Ciphertext      string `json:"ciphertext"`
	CreatedAt       any    `json:"createdAt"`
	UpdatedAt       any    `json:"updatedAt"`
	UpdatedByUserID string `json:"updatedByUserId"`
}

func Connect(ctx context.Context, cfg Config) (*Store, error) {
	if strings.TrimSpace(cfg.EncryptionKey) == "" {
		return nil, ports.ErrSecretStoreUnavailable
	}
	key := deriveKey(cfg.EncryptionKey)
	db, err := sdk.FromEndpointURLString(ctx, sdkEndpointURL(cfg.URL))
	if err != nil {
		return nil, ports.ErrSecretStoreUnavailable
	}
	if cfg.HasCredentials() {
		token, err := db.SignIn(ctx, &sdk.Auth{Username: cfg.Username, Password: cfg.Password})
		if err != nil {
			_ = db.Close(ctx)
			return nil, ports.ErrSecretStoreUnavailable
		}
		if err := db.Authenticate(ctx, token); err != nil {
			_ = db.Close(ctx)
			return nil, ports.ErrSecretStoreUnavailable
		}
	}
	if err := ensureNamespaceDatabase(ctx, db, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, ports.ErrSecretStoreUnavailable
	}
	if err := db.Use(ctx, cfg.Namespace, cfg.Database); err != nil {
		_ = db.Close(ctx)
		return nil, ports.ErrSecretStoreUnavailable
	}
	store := &Store{db: db, cfg: cfg, key: key}
	if err := store.ApplySchema(ctx); err != nil {
		_ = db.Close(ctx)
		return nil, err
	}
	return store, nil
}

func (store *Store) ApplySchema(ctx context.Context) error {
	for _, statement := range schemaStatements() {
		if err := store.exec(ctx, statement, nil); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) CheckReadiness(ctx context.Context) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.db.Use(ctx, store.cfg.Namespace, store.cfg.Database); err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	_, err := sdk.Query[any](ctx, store.db, "INFO FOR DB;", nil)
	if err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	return nil
}

func (store *Store) Close(ctx context.Context) error {
	if store == nil || store.db == nil {
		return nil
	}
	return store.db.Close(ctx)
}

func (store *Store) PutManagedSecret(ctx context.Context, secret ports.ManagedSecretWrite) error {
	block, err := aes.NewCipher(store.key)
	if err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(secret.Value), nil)
	record := secretRecord{
		ID:              secret.ID,
		Scope:           secret.Scope.Scope,
		CompanyID:       secret.Scope.CompanyID,
		ProjectID:       secret.Scope.ProjectID,
		ProviderID:      secret.Scope.ProviderID,
		Algorithm:       algorithmAES256GCM,
		Nonce:           base64.StdEncoding.EncodeToString(nonce),
		Ciphertext:      base64.StdEncoding.EncodeToString(ciphertext),
		CreatedAt:       secret.CreatedAt,
		UpdatedAt:       secret.UpdatedAt,
		UpdatedByUserID: secret.UpdatedByUserID,
	}
	return store.exec(ctx, "UPSERT type::record('managed_secret', $id) CONTENT $record;", map[string]any{
		"id":     record.ID,
		"record": record,
	})
}

func (store *Store) ResolveManagedSecret(ctx context.Context, secretID string, scope ports.SecretScope) (ports.ResolvedSecret, bool, error) {
	rows, err := store.queryRows(ctx, "SELECT record::id(id) AS id, * FROM type::record('managed_secret', $id) LIMIT 1;", map[string]any{"id": secretID})
	if err != nil {
		return ports.ResolvedSecret{}, false, err
	}
	if len(rows) == 0 {
		return ports.ResolvedSecret{}, false, nil
	}
	row := rows[0]
	if row.Scope != scope.Scope || row.CompanyID != scope.CompanyID || row.ProjectID != scope.ProjectID || row.ProviderID != scope.ProviderID {
		return ports.ResolvedSecret{}, false, nil
	}
	if row.Algorithm != algorithmAES256GCM {
		return ports.ResolvedSecret{}, false, ports.ErrSecretStoreUnavailable
	}
	nonce, err := base64.StdEncoding.DecodeString(row.Nonce)
	if err != nil {
		return ports.ResolvedSecret{}, false, ports.ErrSecretStoreUnavailable
	}
	ciphertext, err := base64.StdEncoding.DecodeString(row.Ciphertext)
	if err != nil {
		return ports.ResolvedSecret{}, false, ports.ErrSecretStoreUnavailable
	}
	block, err := aes.NewCipher(store.key)
	if err != nil {
		return ports.ResolvedSecret{}, false, ports.ErrSecretStoreUnavailable
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ports.ResolvedSecret{}, false, ports.ErrSecretStoreUnavailable
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return ports.ResolvedSecret{}, false, ports.ErrSecretStoreUnavailable
	}
	return ports.ResolvedSecret{Value: string(plaintext)}, true, nil
}

func (store *Store) DeleteManagedSecret(ctx context.Context, secretID string, scope ports.SecretScope) error {
	return store.exec(ctx, "DELETE managed_secret WHERE id = type::record('managed_secret', $id) AND scope = $scope AND companyId = $companyId AND projectId = $projectId AND providerId = $providerId;", map[string]any{
		"id":         secretID,
		"scope":      scope.Scope,
		"companyId":  scope.CompanyID,
		"projectId":  scope.ProjectID,
		"providerId": scope.ProviderID,
	})
}

func (store *Store) exec(ctx context.Context, sql string, vars map[string]any) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.db.Use(ctx, store.cfg.Namespace, store.cfg.Database); err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	results, err := sdk.Query[any](ctx, store.db, sql, vars)
	if err != nil {
		return ports.ErrSecretStoreUnavailable
	}
	if results != nil {
		for _, result := range *results {
			if result.Error != nil {
				return ports.ErrSecretStoreUnavailable
			}
		}
	}
	return nil
}

func (store *Store) queryRows(ctx context.Context, sql string, vars map[string]any) ([]secretRecord, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.db.Use(ctx, store.cfg.Namespace, store.cfg.Database); err != nil {
		return nil, ports.ErrSecretStoreUnavailable
	}
	results, err := sdk.Query[[]secretRecord](ctx, store.db, sql, vars)
	if err != nil {
		return nil, ports.ErrSecretStoreUnavailable
	}
	if results == nil || len(*results) == 0 {
		return []secretRecord{}, nil
	}
	if (*results)[0].Error != nil {
		return nil, ports.ErrSecretStoreUnavailable
	}
	return (*results)[0].Result, nil
}

func schemaStatements() []string {
	return []string{
		"DEFINE TABLE IF NOT EXISTS managed_secret SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD IF NOT EXISTS scope ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS companyId ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS projectId ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS providerId ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS algorithm ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS nonce ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS ciphertext ON managed_secret TYPE string;",
		"DEFINE FIELD IF NOT EXISTS createdAt ON managed_secret TYPE datetime;",
		"DEFINE FIELD IF NOT EXISTS updatedAt ON managed_secret TYPE datetime;",
		"DEFINE FIELD IF NOT EXISTS updatedByUserId ON managed_secret TYPE string;",
		"DEFINE INDEX IF NOT EXISTS managed_secret_company_provider ON managed_secret FIELDS companyId, providerId;",
		"DEFINE INDEX IF NOT EXISTS managed_secret_project_provider ON managed_secret FIELDS projectId, providerId;",
	}
}

func ensureNamespaceDatabase(ctx context.Context, db *sdk.DB, namespace string, database string) error {
	sql := fmt.Sprintf("DEFINE NAMESPACE IF NOT EXISTS `%s`; USE NS `%s`; DEFINE DATABASE IF NOT EXISTS `%s`;", escapeIdent(namespace), escapeIdent(namespace), escapeIdent(database))
	_, err := sdk.Query[any](ctx, db, sql, map[string]any{})
	return err
}

func escapeIdent(value string) string {
	return strings.ReplaceAll(value, "`", "\\`")
}

func sdkEndpointURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(trimmed, "http://") {
		return "ws://" + strings.TrimPrefix(trimmed, "http://")
	}
	if strings.HasPrefix(trimmed, "https://") {
		return "wss://" + strings.TrimPrefix(trimmed, "https://")
	}
	return trimmed
}

func deriveKey(value string) []byte {
	sum := sha256.Sum256([]byte(value))
	return sum[:]
}
