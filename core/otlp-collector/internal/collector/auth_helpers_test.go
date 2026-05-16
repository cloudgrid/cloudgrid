package collector

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestProjectStatusCacheRefreshAndDefaults(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	source := &snapshotSource{
		snapshot: ProjectStatusSnapshot{
			CompanyID: " company-1 ",
			ProjectID: " project-1 ",
			Status:    contracts.ProjectStatusActive,
			ChangedAt: now,
		},
	}
	cache := NewProjectStatusCache(ProjectStatusCacheOptions{
		TTL:          5 * time.Second,
		MaxStaleness: 10 * time.Second,
		Now:          func() time.Time { return now },
		Source:       source,
	})

	if cache.TTL() != 5*time.Second || cache.MaxStaleness() != 10*time.Second {
		t.Fatalf("ttl/max staleness = %s/%s", cache.TTL(), cache.MaxStaleness())
	}
	if err := cache.Refresh(context.Background(), "company-1", "project-1"); err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if source.calls != 1 {
		t.Fatalf("source calls = %d, want 1", source.calls)
	}
	if !cache.AllowsIngest("company-1", "project-1", now.Add(time.Second)) {
		t.Fatal("active refreshed project did not allow ingest")
	}
	if cache.AllowsIngest("company-1", "project-1", now.Add(11*time.Second)) {
		t.Fatal("stale project status allowed ingest")
	}
	if err := (*ProjectStatusCache)(nil).Refresh(context.Background(), "company-1", "project-1"); err != nil {
		t.Fatalf("nil Refresh returned error: %v", err)
	}
	if (*ProjectStatusCache)(nil).TTL() != defaultProjectStatusTTL {
		t.Fatal("nil cache TTL did not return default")
	}
	if (*ProjectStatusCache)(nil).MaxStaleness() != defaultProjectStatusMaxStaleness {
		t.Fatal("nil cache max staleness did not return default")
	}
}

func TestProjectStatusCacheRefreshPropagatesSourceError(t *testing.T) {
	cache := NewProjectStatusCache(ProjectStatusCacheOptions{
		Source: &snapshotSource{err: errors.New("control plane unavailable")},
	})

	if err := cache.Refresh(context.Background(), "company-1", "project-1"); err == nil {
		t.Fatal("Refresh returned nil error")
	}
}

func TestBearerAuthHelpersCoverHeaderScopeAndAudienceForms(t *testing.T) {
	if bearerToken("bearer token-1") != "token-1" {
		t.Fatal("bearer token parser did not accept case-insensitive scheme")
	}
	if bearerToken("Bearer") != "" || bearerToken("Basic token") != "" {
		t.Fatal("bearer token parser accepted invalid header")
	}
	if !hasScope([]string{"a", "telemetry:ingest:logs"}, scopeIngestLogs) {
		t.Fatal("hasScope did not find required scope")
	}
	if hasScope([]string{"a"}, scopeIngestLogs) {
		t.Fatal("hasScope accepted missing scope")
	}
	if got := normalizeScopes(" b a a "); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("normalizeScopes string = %#v", got)
	}
	if got := normalizeScopes([]any{"z", 3, "y", "z"}); len(got) != 2 || got[0] != "y" || got[1] != "z" {
		t.Fatalf("normalizeScopes []any = %#v", got)
	}
	if !audienceIncludes([]any{"other", "cloudgrid"}, "cloudgrid") {
		t.Fatal("audienceIncludes did not match array audience")
	}
	if audienceIncludes([]any{"other"}, "cloudgrid") || audienceIncludes(3, "cloudgrid") {
		t.Fatal("audienceIncludes accepted invalid audience")
	}
}

func TestJWKSValidatorsHandleHTTPAndInvalidInputs(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	jwks := jwksJSON(t, "fixture-key", &privateKey.PublicKey)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write(jwks)
	}))
	defer server.Close()

	validator, err := NewHTTPJWKSBearerTokenValidator(context.Background(), HTTPJWKSValidatorConfig{
		Issuer:   "https://issuer.example",
		Audience: "cloudgrid-ingest",
		JWKSURL:  server.URL,
		Now:      func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("NewHTTPJWKSBearerTokenValidator returned error: %v", err)
	}
	if _, err := validator.ValidateBearerToken(context.Background(), "not-a-jwt"); err == nil {
		t.Fatal("validator accepted malformed token")
	}

	for _, config := range []StaticJWKSValidatorConfig{
		{Audience: "cloudgrid", JWKS: jwks},
		{Issuer: "https://issuer.example", JWKS: jwks},
		{Issuer: "https://issuer.example", Audience: "cloudgrid", JWKS: []byte(`{`)},
		{Issuer: "https://issuer.example", Audience: "cloudgrid", JWKS: []byte(`{"keys":[]}`)},
	} {
		if _, err := NewStaticJWKSBearerTokenValidator(config); err == nil {
			t.Fatalf("NewStaticJWKSBearerTokenValidator accepted config %#v", config)
		}
	}
	if _, err := NewHTTPJWKSBearerTokenValidator(context.Background(), HTTPJWKSValidatorConfig{}); err == nil {
		t.Fatal("NewHTTPJWKSBearerTokenValidator accepted missing URL")
	}
	if _, err := NewHTTPJWKSBearerTokenValidator(context.Background(), HTTPJWKSValidatorConfig{
		Issuer:   "https://issuer.example",
		Audience: "cloudgrid",
		JWKSURL:  "://bad-url",
	}); err == nil {
		t.Fatal("NewHTTPJWKSBearerTokenValidator accepted invalid URL")
	}
	failingServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer failingServer.Close()
	if _, err := NewHTTPJWKSBearerTokenValidator(context.Background(), HTTPJWKSValidatorConfig{
		Issuer:   "https://issuer.example",
		Audience: "cloudgrid",
		JWKSURL:  failingServer.URL,
	}); err == nil {
		t.Fatal("NewHTTPJWKSBearerTokenValidator accepted non-2xx JWKS response")
	}
}

func TestStaticJWTValidatorRejectsMalformedHeadersAndUnknownKeys(t *testing.T) {
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	fixture := newJWTFixture(t, now)

	for _, token := range []string{
		mustBase64JSON(map[string]any{"alg": "HS256", "kid": fixture.keyID}) + "." + mustBase64JSON(map[string]any{}) + ".sig",
		mustBase64JSON(map[string]any{"alg": "RS256", "kid": "missing-key"}) + "." + mustBase64JSON(map[string]any{}) + ".sig",
		mustBase64JSON(map[string]any{"alg": "RS256", "kid": fixture.keyID}) + ".not-base64.sig",
		fixture.token(jwtClaims{
			Subject:   "",
			CompanyID: "company-1",
			ProjectID: "project-1",
			Scopes:    []string{scopeIngestTraces},
		}),
	} {
		if _, err := fixture.validator.ValidateBearerToken(context.Background(), token); err == nil {
			t.Fatalf("ValidateBearerToken accepted invalid token %q", token)
		}
	}
}

type snapshotSource struct {
	calls    int
	snapshot ProjectStatusSnapshot
	err      error
}

func (source *snapshotSource) Snapshot(_ context.Context, _ string, _ string) (ProjectStatusSnapshot, error) {
	source.calls++
	if source.err != nil {
		return ProjectStatusSnapshot{}, source.err
	}
	return source.snapshot, nil
}
