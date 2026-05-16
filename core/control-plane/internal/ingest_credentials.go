package internal

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

var ingestCredentialScopes = []string{
	"telemetry:ingest:traces",
	"telemetry:ingest:logs",
	"telemetry:ingest:metrics",
}

type IngestCredential struct {
	ID              string     `json:"id"`
	ProjectID       string     `json:"projectId"`
	Title           string     `json:"title"`
	Scopes          []string   `json:"scopes"`
	SecretPreview   string     `json:"secretPreview"`
	CreatedAt       time.Time  `json:"createdAt"`
	LastUsedAt      *time.Time `json:"lastUsedAt,omitempty"`
	RevokedAt       *time.Time `json:"revokedAt,omitempty"`
	CreatedByUserID string     `json:"createdByUserId"`
}

type IngestCredentialListRequest struct {
	contracts.BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type IngestCredentialListData struct {
	Items []IngestCredential `json:"items"`
}

type IngestCredentialListResponse struct {
	RequestID string                    `json:"requestId"`
	OK        bool                      `json:"ok"`
	Data      *IngestCredentialListData `json:"data,omitempty"`
	Error     *contracts.BridgeError    `json:"error,omitempty"`
}

type IngestCredentialCreateRequest struct {
	contracts.BridgeEnvelope
	ProjectID string `json:"projectId"`
	Title string `json:"title"`
}

type CreatedIngestCredential struct {
	Credential IngestCredential `json:"credential"`
	Secret     string           `json:"secret"`
}

type IngestCredentialCreateResponse struct {
	RequestID string                   `json:"requestId"`
	OK        bool                     `json:"ok"`
	Data      *CreatedIngestCredential `json:"data,omitempty"`
	Error     *contracts.BridgeError   `json:"error,omitempty"`
}

type IngestCredentialRevokeRequest struct {
	contracts.BridgeEnvelope
	CredentialID string `json:"credentialId"`
}

type IngestCredentialRevokeData struct {
	Credential IngestCredential `json:"credential"`
}

type IngestCredentialRevokeResponse struct {
	RequestID string                      `json:"requestId"`
	OK        bool                        `json:"ok"`
	Data      *IngestCredentialRevokeData `json:"data,omitempty"`
	Error     *contracts.BridgeError      `json:"error,omitempty"`
}

func (service *Service) ListIngestCredentials(ctx context.Context, request IngestCredentialListRequest) (IngestCredentialListData, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return IngestCredentialListData{}, err
	}
	records, err := service.store.ListIngestCredentials(ctx, project.ID)
	if err != nil {
		return IngestCredentialListData{}, storageError()
	}
	items := make([]IngestCredential, 0, len(records))
	for _, record := range records {
		items = append(items, contractIngestCredential(record))
	}
	return IngestCredentialListData{Items: items}, nil
}

func (service *Service) CreateIngestCredential(ctx context.Context, request IngestCredentialCreateRequest) (CreatedIngestCredential, error) {
	title := strings.TrimSpace(request.Title)
	if title == "" {
		return CreatedIngestCredential{}, validationError("title is required")
	}
	if len([]rune(title)) > 80 {
		return CreatedIngestCredential{}, validationError("title must be at most 80 characters")
	}
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return CreatedIngestCredential{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, project.OrganizationID); err != nil {
		return CreatedIngestCredential{}, err
	}
	secret, err := generateIngestSecret()
	if err != nil {
		return CreatedIngestCredential{}, storageError()
	}
	now := service.now().UTC()
	record := ports.IngestCredentialRecord{
		ID:            "ingest-credential-" + normalizeID(project.ID) + "-" + normalizeID(title) + "-" + fmt.Sprintf("%d", now.UnixNano()),
		ProjectID:     project.ID,
		SecretHash:    hashIngestSecret(secret),
		CreatedAt:     now,
		DisplayName:   &title,
		CreatedByUser: principalID(request.BridgeEnvelope),
	}
	if err := service.store.PutIngestCredential(ctx, record); err != nil {
		return CreatedIngestCredential{}, storageError()
	}
	return CreatedIngestCredential{Credential: contractIngestCredential(record), Secret: secret}, nil
}

func (service *Service) RevokeIngestCredential(ctx context.Context, request IngestCredentialRevokeRequest) (IngestCredential, error) {
	if strings.TrimSpace(request.CredentialID) == "" {
		return IngestCredential{}, validationError("credentialId is required")
	}
	record, ok, err := service.store.GetIngestCredential(ctx, request.CredentialID)
	if err != nil {
		return IngestCredential{}, storageError()
	}
	if !ok {
		return IngestCredential{}, forbiddenError("ingest credential is not accessible")
	}
	if _, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, record.ProjectID); err != nil {
		return IngestCredential{}, err
	}
	if record.DisabledAt == nil {
		now := service.now().UTC()
		record.DisabledAt = &now
		if err := service.store.PutIngestCredential(ctx, record); err != nil {
			return IngestCredential{}, storageError()
		}
	}
	return contractIngestCredential(record), nil
}

func contractIngestCredential(record ports.IngestCredentialRecord) IngestCredential {
	title := ""
	if record.DisplayName != nil {
		title = *record.DisplayName
	}
	return IngestCredential{
		ID:              record.ID,
		ProjectID:       record.ProjectID,
		Title:           title,
		Scopes:          append([]string{}, ingestCredentialScopes...),
		SecretPreview:   secretPreviewFromHash(record.SecretHash),
		CreatedAt:       record.CreatedAt,
		LastUsedAt:      record.LastUsedAt,
		RevokedAt:       record.DisabledAt,
		CreatedByUserID: record.CreatedByUser,
	}
}

func generateIngestSecret() (string, error) {
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}
	return "cgk_" + base64.RawURLEncoding.EncodeToString(randomBytes), nil
}

func hashIngestSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func secretPreviewFromHash(hash string) string {
	if len(hash) < 8 {
		return "cgk_..."
	}
	return "cgk_..." + hash[len(hash)-4:]
}
