package collector

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sort"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	DeploymentModeLocal    = "local"
	DeploymentModeDeployed = "deployed"

	AuthModeLocal = "local"
	AuthModeSSO   = "sso"

	scopeIngestTraces  = "telemetry:ingest:traces"
	scopeIngestLogs    = "telemetry:ingest:logs"
	scopeIngestMetrics = "telemetry:ingest:metrics"

	defaultLocalProjectID  = "default"
	localTenantID          = "local"
	localCompanyID         = "local"
	jwtClockSkew           = 60 * time.Second
	defaultMaxRequestBytes = int64(4 * 1024 * 1024)
)

var errInvalidBearerToken = errors.New("invalid bearer token")

type HandlerOptions struct {
	DeploymentMode     string
	AuthMode           string
	LocalProjectID     string
	LocalProjectTokens map[string]string
	TokenValidator     BearerTokenValidator
	ProjectCache       *ProjectStatusCache
	MaxRequestBytes    int64
	MetricsRecorder    MetricsRecorder
	SelfObservability  SelfObservabilityRecorder
	Now                func() time.Time
}

type BearerTokenClaims struct {
	PrincipalID string
	CompanyID   string
	ProjectID   string
	Scopes      []string
}

type BearerTokenValidator interface {
	ValidateBearerToken(ctx context.Context, token string) (BearerTokenClaims, error)
}

type StaticJWKSValidatorConfig struct {
	Issuer   string
	Audience string
	JWKS     []byte
	Now      func() time.Time
}

type HTTPJWKSValidatorConfig struct {
	Issuer   string
	Audience string
	JWKSURL  string
	Client   *http.Client
	Now      func() time.Time
}

type staticJWKSBearerTokenValidator struct {
	issuer   string
	audience string
	keys     map[string]*rsa.PublicKey
	now      func() time.Time
}

func NewStaticJWKSBearerTokenValidator(config StaticJWKSValidatorConfig) (BearerTokenValidator, error) {
	if strings.TrimSpace(config.Issuer) == "" {
		return nil, fmt.Errorf("issuer is required")
	}
	if strings.TrimSpace(config.Audience) == "" {
		return nil, fmt.Errorf("audience is required")
	}
	keys, err := parseRSAJWKS(config.JWKS)
	if err != nil {
		return nil, err
	}
	now := config.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return staticJWKSBearerTokenValidator{
		issuer:   strings.TrimSpace(config.Issuer),
		audience: strings.TrimSpace(config.Audience),
		keys:     keys,
		now:      now,
	}, nil
}

func NewHTTPJWKSBearerTokenValidator(ctx context.Context, config HTTPJWKSValidatorConfig) (BearerTokenValidator, error) {
	if strings.TrimSpace(config.JWKSURL) == "" {
		return nil, fmt.Errorf("jwks url is required")
	}
	client := config.Client
	if client == nil {
		client = http.DefaultClient
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, config.JWKSURL, nil)
	if err != nil {
		return nil, fmt.Errorf("invalid jwks url")
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch jwks")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return nil, fmt.Errorf("fetch jwks")
	}
	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read jwks")
	}
	return NewStaticJWKSBearerTokenValidator(StaticJWKSValidatorConfig{
		Issuer:   config.Issuer,
		Audience: config.Audience,
		JWKS:     payload,
		Now:      config.Now,
	})
}

func (validator staticJWKSBearerTokenValidator) ValidateBearerToken(_ context.Context, token string) (BearerTokenClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return BearerTokenClaims{}, errInvalidBearerToken
	}

	headerPayload, err := decodeJWTJSON[struct {
		Algorithm string `json:"alg"`
		KeyID     string `json:"kid"`
	}](parts[0])
	if err != nil || headerPayload.Algorithm != "RS256" || strings.TrimSpace(headerPayload.KeyID) == "" {
		return BearerTokenClaims{}, errInvalidBearerToken
	}
	key, ok := validator.keys[headerPayload.KeyID]
	if !ok {
		return BearerTokenClaims{}, errInvalidBearerToken
	}

	claimsPayload, err := decodeJWTJSON[struct {
		Issuer    string `json:"iss"`
		Audience  any    `json:"aud"`
		Subject   string `json:"sub"`
		ExpiresAt int64  `json:"exp"`
		NotBefore int64  `json:"nbf"`
		IssuedAt  int64  `json:"iat"`
		Scope     any    `json:"scope"`
		CompanyID string `json:"company_id"`
		ProjectID string `json:"project_id"`
	}](parts[1])
	if err != nil {
		return BearerTokenClaims{}, errInvalidBearerToken
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return BearerTokenClaims{}, errInvalidBearerToken
	}
	signingInput := parts[0] + "." + parts[1]
	digest := sha256.Sum256([]byte(signingInput))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature); err != nil {
		return BearerTokenClaims{}, errInvalidBearerToken
	}

	now := validator.now()
	if claimsPayload.Issuer != validator.issuer ||
		!audienceIncludes(claimsPayload.Audience, validator.audience) ||
		strings.TrimSpace(claimsPayload.Subject) == "" ||
		claimsPayload.ExpiresAt == 0 ||
		time.Unix(claimsPayload.ExpiresAt, 0).Add(jwtClockSkew).Before(now) ||
		(claimsPayload.NotBefore != 0 && time.Unix(claimsPayload.NotBefore, 0).Add(-jwtClockSkew).After(now)) ||
		(claimsPayload.IssuedAt != 0 && time.Unix(claimsPayload.IssuedAt, 0).Add(-jwtClockSkew).After(now)) {
		return BearerTokenClaims{}, errInvalidBearerToken
	}

	return BearerTokenClaims{
		PrincipalID: strings.TrimSpace(claimsPayload.Subject),
		CompanyID:   strings.TrimSpace(claimsPayload.CompanyID),
		ProjectID:   strings.TrimSpace(claimsPayload.ProjectID),
		Scopes:      normalizeScopes(claimsPayload.Scope),
	}, nil
}

func (h *handler) authorizeIngest(r *http.Request, requiredScope string) (*contracts.AuthContext, *problemDetails) {
	return h.authorizeIngestContext(r.Context(), r.Header.Get("Authorization"), requiredScope)
}

func (h *handler) authorizeIngestContext(ctx context.Context, authorization string, requiredScope string) (*contracts.AuthContext, *problemDetails) {
	checkedAt := h.now()
	authMode := h.authMode
	if authMode == "" {
		authMode = AuthModeLocal
	}
	deploymentMode := h.deploymentMode
	if deploymentMode == "" {
		deploymentMode = DeploymentModeLocal
	}

	if deploymentMode == DeploymentModeLocal && authMode == AuthModeLocal {
		if len(h.localProjectTokens) > 0 {
			token := bearerToken(authorization)
			if token == "" {
				problem := unauthenticatedProblem()
				return nil, &problem
			}
			projectID, ok := h.localProjectForBearerToken(token)
			if !ok {
				problem := forbiddenProblem()
				return nil, &problem
			}
			allowed := true
			return &contracts.AuthContext{
				Mode:          "service",
				AuthMode:      ptr(AuthModeLocal),
				TenantID:      ptr(localTenantID),
				CompanyID:     ptr(localCompanyID),
				ProjectID:     ptr(projectID),
				Scopes:        []string{},
				IngestAllowed: &allowed,
				CheckedAt:     &checkedAt,
			}, nil
		}
		projectID := strings.TrimSpace(h.localProjectID)
		if projectID == "" {
			projectID = defaultLocalProjectID
		}
		allowed := true
		return &contracts.AuthContext{
			Mode:          "anonymous",
			AuthMode:      ptr(AuthModeLocal),
			TenantID:      ptr(localTenantID),
			CompanyID:     ptr(localCompanyID),
			ProjectID:     ptr(projectID),
			Scopes:        []string{},
			IngestAllowed: &allowed,
			CheckedAt:     &checkedAt,
		}, nil
	}

	token := bearerToken(authorization)
	if token == "" || h.tokenValidator == nil {
		problem := unauthenticatedProblem()
		return nil, &problem
	}
	claims, err := h.tokenValidator.ValidateBearerToken(ctx, token)
	if err != nil {
		problem := unauthenticatedProblem()
		return nil, &problem
	}
	if strings.TrimSpace(claims.CompanyID) == "" || strings.TrimSpace(claims.ProjectID) == "" || !hasScope(claims.Scopes, requiredScope) {
		problem := forbiddenProblem()
		return nil, &problem
	}
	if h.projectCache == nil || !h.projectCache.AllowsIngest(claims.CompanyID, claims.ProjectID, checkedAt) {
		problem := forbiddenProblem()
		return nil, &problem
	}

	allowed := true
	scopes := append([]string(nil), claims.Scopes...)
	sort.Strings(scopes)
	return &contracts.AuthContext{
		Mode:          "service",
		AuthMode:      ptr(AuthModeSSO),
		PrincipalID:   ptr(claims.PrincipalID),
		TenantID:      ptr(claims.CompanyID),
		CompanyID:     ptr(claims.CompanyID),
		ProjectID:     ptr(claims.ProjectID),
		Scopes:        scopes,
		IngestAllowed: &allowed,
		CheckedAt:     &checkedAt,
	}, nil
}

func (h *handler) localProjectForBearerToken(token string) (string, bool) {
	for configuredToken, projectID := range h.localProjectTokens {
		if subtle.ConstantTimeCompare([]byte(configuredToken), []byte(token)) == 1 {
			projectID = strings.TrimSpace(projectID)
			if projectID == "" {
				return "", false
			}
			return projectID, true
		}
	}
	return "", false
}

func bearerToken(header string) string {
	fields := strings.Fields(header)
	if len(fields) != 2 || !strings.EqualFold(fields[0], "Bearer") {
		return ""
	}
	return fields[1]
}

func hasScope(scopes []string, required string) bool {
	for _, scope := range scopes {
		if scope == required {
			return true
		}
	}
	return false
}

func normalizeScopes(value any) []string {
	seen := map[string]bool{}
	add := func(scope string) {
		scope = strings.TrimSpace(scope)
		if scope != "" {
			seen[scope] = true
		}
	}
	switch typed := value.(type) {
	case string:
		for _, scope := range strings.Fields(typed) {
			add(scope)
		}
	case []any:
		for _, item := range typed {
			if scope, ok := item.(string); ok {
				add(scope)
			}
		}
	case []string:
		for _, scope := range typed {
			add(scope)
		}
	}
	scopes := make([]string, 0, len(seen))
	for scope := range seen {
		scopes = append(scopes, scope)
	}
	sort.Strings(scopes)
	return scopes
}

func audienceIncludes(value any, required string) bool {
	switch typed := value.(type) {
	case string:
		return typed == required
	case []any:
		for _, item := range typed {
			if audience, ok := item.(string); ok && audience == required {
				return true
			}
		}
	}
	return false
}

func decodeJWTJSON[T any](part string) (T, error) {
	var value T
	payload, err := base64.RawURLEncoding.DecodeString(part)
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal(payload, &value); err != nil {
		return value, err
	}
	return value, nil
}

func parseRSAJWKS(payload []byte) (map[string]*rsa.PublicKey, error) {
	var jwks struct {
		Keys []struct {
			KeyType  string `json:"kty"`
			KeyID    string `json:"kid"`
			Modulus  string `json:"n"`
			Exponent string `json:"e"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(payload, &jwks); err != nil {
		return nil, fmt.Errorf("invalid jwks")
	}
	keys := map[string]*rsa.PublicKey{}
	for _, key := range jwks.Keys {
		if key.KeyType != "RSA" || strings.TrimSpace(key.KeyID) == "" {
			continue
		}
		modulus, err := base64.RawURLEncoding.DecodeString(key.Modulus)
		if err != nil {
			return nil, fmt.Errorf("invalid jwks")
		}
		exponentBytes, err := base64.RawURLEncoding.DecodeString(key.Exponent)
		if err != nil {
			return nil, fmt.Errorf("invalid jwks")
		}
		keys[key.KeyID] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(modulus),
			E: int(new(big.Int).SetBytes(exponentBytes).Int64()),
		}
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("jwks contains no RSA keys")
	}
	return keys, nil
}

func ptr[T any](value T) *T {
	return &value
}
