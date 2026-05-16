package collector

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestLocalModePublishesNormalizedAuthContextWithConfiguredProject(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeLocal,
		AuthMode:       AuthModeLocal,
		LocalProjectID: "local-project",
	})
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	command := publishedCommand(t, publisher)
	if command.AuthContext == nil {
		t.Fatal("authContext is nil")
	}
	assertAuthContext(t, command.AuthContext, contracts.AuthContext{
		Mode:          "anonymous",
		AuthMode:      ptr(AuthModeLocal),
		TenantID:      ptr("local"),
		CompanyID:     ptr("local"),
		ProjectID:     ptr("local-project"),
		Scopes:        []string{},
		IngestAllowed: ptr(true),
	})
}

func TestLocalModeDefaultsProjectWhenUnconfigured(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeLocal,
		AuthMode:       AuthModeLocal,
	})
	payload := mustProtoJSON(t, logsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	command := publishedCommand(t, publisher)
	if command.AuthContext == nil || command.AuthContext.ProjectID == nil || *command.AuthContext.ProjectID != "default" {
		t.Fatalf("authContext = %#v, want default project", command.AuthContext)
	}
}

func TestLocalModeProjectTokenRoutesToConfiguredProject(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeLocal,
		AuthMode:       AuthModeLocal,
		LocalProjectTokens: map[string]string{
			"local-token-for-project-alpha-123456": "project-alpha",
		},
	})
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer local-token-for-project-alpha-123456")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	command := publishedCommand(t, publisher)
	if command.AuthContext == nil || command.AuthContext.ProjectID == nil || *command.AuthContext.ProjectID != "project-alpha" {
		t.Fatalf("authContext = %#v, want project-alpha", command.AuthContext)
	}
}

func TestLocalModeProjectTokenRejectsMissingOrInvalidBearer(t *testing.T) {
	for _, tt := range []struct {
		name          string
		authorization string
		wantID        string
	}{
		{name: "missing", wantID: "ERR-015"},
		{name: "invalid", authorization: "Bearer wrong-token", wantID: "ERR-016"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			publisher := &recordingPublisher{}
			handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
				DeploymentMode: DeploymentModeLocal,
				AuthMode:       AuthModeLocal,
				LocalProjectTokens: map[string]string{
					"local-token-for-project-alpha-123456": "project-alpha",
				},
			})
			payload := mustProtoJSON(t, traceRequest())
			request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			if tt.authorization != "" {
				request.Header.Set("Authorization", tt.authorization)
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			wantCode := "UNAUTHENTICATED"
			if tt.wantID == "ERR-016" {
				wantCode = "FORBIDDEN"
			}
			assertProblem(t, response, tt.wantID, wantCode)
			if publisher.callCount() != 0 {
				t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
			}
		})
	}
}

func TestDeployedModePublishesServiceAuthContextForActiveProject(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	fixture := newJWTFixture(t, now)
	cache := NewProjectStatusCache(ProjectStatusCacheOptions{Now: func() time.Time { return now }})
	cache.Set(ProjectStatusSnapshot{
		CompanyID: "company-1",
		ProjectID: "project-1",
		Status:    contracts.ProjectStatusActive,
		ChangedAt: now.Add(-time.Minute),
		CachedAt:  now.Add(-30 * time.Second),
	})
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeDeployed,
		AuthMode:       AuthModeSSO,
		TokenValidator: fixture.validator,
		ProjectCache:   cache,
		Now:            func() time.Time { return now },
	})
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+fixture.token(jwtClaims{
		Subject:   "collector-client",
		CompanyID: "company-1",
		ProjectID: "project-1",
		Scopes:    []string{"telemetry:ingest:traces", "telemetry:ingest:logs"},
	}))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	command := publishedCommand(t, publisher)
	assertAuthContext(t, command.AuthContext, contracts.AuthContext{
		Mode:          "service",
		AuthMode:      ptr(AuthModeSSO),
		PrincipalID:   ptr("collector-client"),
		TenantID:      ptr("company-1"),
		CompanyID:     ptr("company-1"),
		ProjectID:     ptr("project-1"),
		Scopes:        []string{"telemetry:ingest:logs", "telemetry:ingest:traces"},
		IngestAllowed: ptr(true),
	})
}

func TestDeployedModeProjectStatusCacheDecisions(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	fixture := newJWTFixture(t, now)

	tests := []struct {
		name     string
		status   *ProjectStatusSnapshot
		wantCode int
	}{
		{
			name: "active allows ingest",
			status: &ProjectStatusSnapshot{
				CompanyID: "company-1",
				ProjectID: "project-1",
				Status:    contracts.ProjectStatusActive,
				ChangedAt: now,
				CachedAt:  now,
			},
			wantCode: http.StatusOK,
		},
		{
			name: "read_only denies ingest",
			status: &ProjectStatusSnapshot{
				CompanyID: "company-1",
				ProjectID: "project-1",
				Status:    contracts.ProjectStatusReadOnly,
				ChangedAt: now,
				CachedAt:  now,
			},
			wantCode: http.StatusForbidden,
		},
		{
			name: "disabled denies ingest",
			status: &ProjectStatusSnapshot{
				CompanyID: "company-1",
				ProjectID: "project-1",
				Status:    contracts.ProjectStatusDisabled,
				ChangedAt: now,
				CachedAt:  now,
			},
			wantCode: http.StatusForbidden,
		},
		{
			name:     "missing denies ingest",
			status:   nil,
			wantCode: http.StatusForbidden,
		},
		{
			name: "stale denies ingest",
			status: &ProjectStatusSnapshot{
				CompanyID: "company-1",
				ProjectID: "project-1",
				Status:    contracts.ProjectStatusActive,
				ChangedAt: now.Add(-3 * time.Minute),
				CachedAt:  now.Add(-121 * time.Second),
			},
			wantCode: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cache := NewProjectStatusCache(ProjectStatusCacheOptions{Now: func() time.Time { return now }})
			if tt.status != nil {
				cache.Set(*tt.status)
			}
			publisher := &recordingPublisher{}
			handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
				DeploymentMode: DeploymentModeDeployed,
				AuthMode:       AuthModeSSO,
				TokenValidator: fixture.validator,
				ProjectCache:   cache,
				Now:            func() time.Time { return now },
			})
			payload := mustProtoJSON(t, logsRequest())
			request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer "+fixture.token(jwtClaims{
				Subject:   "collector-client",
				CompanyID: "company-1",
				ProjectID: "project-1",
				Scopes:    []string{"telemetry:ingest:logs"},
			}))
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != tt.wantCode {
				t.Fatalf("status = %d body = %s, want %d", response.Code, response.Body.String(), tt.wantCode)
			}
			if tt.wantCode == http.StatusOK && publisher.callCount() != 1 {
				t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
			}
			if tt.wantCode != http.StatusOK {
				assertProblem(t, response, "ERR-016", "FORBIDDEN")
				if publisher.callCount() != 0 {
					t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
				}
			}
		})
	}
}

func TestDeployedModeInvalidTokenReturnsUnauthenticated(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	fixture := newJWTFixture(t, now)
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeDeployed,
		AuthMode:       AuthModeSSO,
		TokenValidator: fixture.validator,
		ProjectCache:   NewProjectStatusCache(ProjectStatusCacheOptions{Now: func() time.Time { return now }}),
		Now:            func() time.Time { return now },
	})
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer not-a-valid-jwt")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body = %s, want 401", response.Code, response.Body.String())
	}
	assertProblem(t, response, "ERR-015", "UNAUTHENTICATED")
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestDeployedModeMissingProjectClaimReturnsForbidden(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	fixture := newJWTFixture(t, now)
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeDeployed,
		AuthMode:       AuthModeSSO,
		TokenValidator: fixture.validator,
		ProjectCache:   NewProjectStatusCache(ProjectStatusCacheOptions{Now: func() time.Time { return now }}),
		Now:            func() time.Time { return now },
	})
	payload := mustProtoJSON(t, logsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+fixture.token(jwtClaims{
		Subject:   "collector-client",
		CompanyID: "company-1",
		Scopes:    []string{"telemetry:ingest:logs"},
	}))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d body = %s, want 403", response.Code, response.Body.String())
	}
	assertProblem(t, response, "ERR-016", "FORBIDDEN")
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestDeployedModeDoesNotRefreshProjectStatusOnIngestRequest(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	fixture := newJWTFixture(t, now)
	source := &countingProjectStatusSource{}
	cache := NewProjectStatusCache(ProjectStatusCacheOptions{
		Now:    func() time.Time { return now },
		Source: source,
	})
	cache.Set(ProjectStatusSnapshot{
		CompanyID: "company-1",
		ProjectID: "project-1",
		Status:    contracts.ProjectStatusActive,
		ChangedAt: now,
		CachedAt:  now,
	})
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		DeploymentMode: DeploymentModeDeployed,
		AuthMode:       AuthModeSSO,
		TokenValidator: fixture.validator,
		ProjectCache:   cache,
		Now:            func() time.Time { return now },
	})
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+fixture.token(jwtClaims{
		Subject:   "collector-client",
		CompanyID: "company-1",
		ProjectID: "project-1",
		Scopes:    []string{"telemetry:ingest:traces"},
	}))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	if source.calls != 0 {
		t.Fatalf("project status source calls = %d, want 0 on ingest hot path", source.calls)
	}
}

type jwtClaims struct {
	Subject   string
	CompanyID string
	ProjectID string
	Scopes    []string
}

type jwtFixture struct {
	privateKey *rsa.PrivateKey
	keyID      string
	issuer     string
	audience   string
	now        time.Time
	validator  BearerTokenValidator
}

func newJWTFixture(t *testing.T, now time.Time) jwtFixture {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	fixture := jwtFixture{
		privateKey: privateKey,
		keyID:      "fixture-key",
		issuer:     "https://issuer.example",
		audience:   "cloudgrid-ingest",
		now:        now,
	}
	jwks := jwksJSON(t, fixture.keyID, &privateKey.PublicKey)
	validator, err := NewStaticJWKSBearerTokenValidator(StaticJWKSValidatorConfig{
		Issuer:   fixture.issuer,
		Audience: fixture.audience,
		JWKS:     jwks,
		Now:      func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	fixture.validator = validator
	return fixture
}

func (f jwtFixture) token(claims jwtClaims) string {
	header := map[string]any{"alg": "RS256", "kid": f.keyID, "typ": "JWT"}
	payload := map[string]any{
		"iss":        f.issuer,
		"aud":        f.audience,
		"sub":        claims.Subject,
		"iat":        f.now.Unix(),
		"nbf":        f.now.Add(-time.Minute).Unix(),
		"exp":        f.now.Add(time.Hour).Unix(),
		"scope":      claims.Scopes,
		"company_id": claims.CompanyID,
	}
	if claims.ProjectID != "" {
		payload["project_id"] = claims.ProjectID
	}
	headerPart := mustBase64JSON(header)
	payloadPart := mustBase64JSON(payload)
	signingInput := headerPart + "." + payloadPart
	sum := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, f.privateKey, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func jwksJSON(t *testing.T, keyID string, publicKey *rsa.PublicKey) []byte {
	t.Helper()
	jwks := map[string]any{
		"keys": []map[string]any{{
			"kty": "RSA",
			"kid": keyID,
			"alg": "RS256",
			"use": "sig",
			"n":   base64.RawURLEncoding.EncodeToString(publicKey.N.Bytes()),
			"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(publicKey.E)).Bytes()),
		}},
	}
	payload, err := json.Marshal(jwks)
	if err != nil {
		t.Fatalf("marshal jwks: %v", err)
	}
	return payload
}

func mustBase64JSON(value any) string {
	payload, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(payload)
}

func publishedCommand(t *testing.T, publisher *recordingPublisher) contracts.PersistTelemetryCommand {
	t.Helper()
	if publisher.callCount() != 1 {
		t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
	}
	var command contracts.PersistTelemetryCommand
	if err := json.Unmarshal(publisher.calls[0].data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	return command
}

func assertAuthContext(t *testing.T, got *contracts.AuthContext, want contracts.AuthContext) {
	t.Helper()
	if got == nil {
		t.Fatal("authContext is nil")
	}
	if got.Mode != want.Mode ||
		deref(got.AuthMode) != deref(want.AuthMode) ||
		deref(got.PrincipalID) != deref(want.PrincipalID) ||
		deref(got.TenantID) != deref(want.TenantID) ||
		deref(got.CompanyID) != deref(want.CompanyID) ||
		deref(got.ProjectID) != deref(want.ProjectID) ||
		derefBool(got.IngestAllowed) != derefBool(want.IngestAllowed) {
		t.Fatalf("authContext = %#v, want %#v", got, want)
	}
	if len(got.Scopes) != len(want.Scopes) {
		t.Fatalf("scopes = %#v, want %#v", got.Scopes, want.Scopes)
	}
	for index := range got.Scopes {
		if got.Scopes[index] != want.Scopes[index] {
			t.Fatalf("scopes = %#v, want %#v", got.Scopes, want.Scopes)
		}
	}
	if got.CheckedAt == nil || got.CheckedAt.IsZero() {
		t.Fatalf("checkedAt = %#v, want set", got.CheckedAt)
	}
}

func assertProblem(t *testing.T, response *httptest.ResponseRecorder, id string, code string) {
	t.Helper()
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal problem: %v", err)
	}
	if body.Error.ID != id || body.Error.Code != code {
		t.Fatalf("problem = %#v, want %s %s", body.Error, id, code)
	}
}

func derefBool(value *bool) bool {
	if value == nil {
		return false
	}
	return *value
}

type countingProjectStatusSource struct {
	calls int
}

func (source *countingProjectStatusSource) Snapshot(_ context.Context, _ string, _ string) (ProjectStatusSnapshot, error) {
	source.calls++
	return ProjectStatusSnapshot{}, nil
}
