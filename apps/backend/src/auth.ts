import {
  type AuthProvider,
  type AuthProviderRuntimeConfig,
  type AuthRuntimeConfig,
  createProblemDetails,
  type ProblemDetails,
} from "@cloudgrid/runtime";
import type { User } from "@cloudgrid/ui-contracts";
import { GraphQLError } from "graphql";

const sessionCookieName = "cloudgrid_session";
const loginCookieName = "cloudgrid_login";
const clockSkewSeconds = 60;

export interface NormalizedAuthContext {
  mode: "anonymous" | "authenticated" | "service";
  authMode?: "local" | "sso";
  principalId?: string;
  principalDisplayName?: string;
  principalEmail?: string;
  principalEmailVerified?: boolean;
  tenantId?: string;
  companyId?: string;
  projectId?: string;
  scopes?: string[];
  ingestAllowed?: boolean;
  readAllowed?: boolean;
  checkedAt?: string;
}

export interface AuthenticatedPrincipal {
  principalId: string;
  user: User;
  principalEmailVerified?: boolean;
  scopes?: string[];
}

export interface AuthProviderFixture {
  authorizationEndpoint?: string;
  completeCallback(input: {
    code: string;
    state: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<AuthenticatedPrincipal>;
}

interface LoginTransaction {
  provider: AuthProvider;
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  expiresAt: number;
}

interface BrowserSession {
  id: string;
  principal: AuthenticatedPrincipal;
  selectedProjectId?: string;
  expiresAt: number;
}

interface BearerClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  scope?: string | string[];
  scopes?: string[];
  tenant_id?: string;
  company_id?: string;
  project_id?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  nonce?: string;
}

export interface AuthServiceOptions {
  provider?: AuthProviderFixture;
  now?: () => number;
  fetch?: typeof fetch;
}

export class CloudGridAuthService {
  #config: AuthRuntimeConfig;
  #provider?: AuthProviderFixture;
  #transactions = new Map<string, LoginTransaction>();
  #sessions = new Map<string, BrowserSession>();
  #localSelectedProjectId?: string;
  #now: () => number;
  #fetch: typeof fetch;

  constructor(
    config: AuthRuntimeConfig = { mode: "local", sessionTtlSeconds: 28_800 },
    options: AuthServiceOptions = {},
  ) {
    this.#config = config;
    if (options.provider) {
      this.#provider = options.provider;
    }
    this.#now = options.now ?? Date.now;
    this.#fetch = options.fetch ?? fetch;
  }

  login(request: Request): Response {
    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    if (this.#config.mode === "local") {
      return Response.redirect(new URL(returnTo, url.origin), 302);
    }

    let provider: AuthProvider;
    try {
      provider = this.#providerName(url.searchParams.get("provider"));
    } catch {
      return problemResponse(unauthenticatedProblem());
    }
    const state = randomToken();
    const transaction: LoginTransaction = {
      provider,
      state,
      codeVerifier: randomToken(),
      nonce: randomToken(),
      returnTo,
      expiresAt: this.#now() + 10 * 60 * 1000,
    };
    this.#transactions.set(state, transaction);
    const authorizationUrl = this.#authorizationUrl(transaction, this.#providerConfig(provider));
    return new Response(null, {
      status: 302,
      headers: {
        location: authorizationUrl.toString(),
        "set-cookie": cookie(loginCookieName, state, {
          httpOnly: true,
          sameSite: "Lax",
          secure: true,
          maxAge: 600,
          path: "/auth",
        }),
      },
    });
  }

  async callback(request: Request): Promise<Response> {
    if (this.#config.mode !== "sso") {
      return Response.redirect(new URL("/projects", request.url), 302);
    }
    try {
      const url = new URL(request.url);
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      const cookieState = parseCookies(request.headers.get("cookie")).get(loginCookieName);
      const transaction = this.#transactions.get(state);
      if (!state || !code || !cookieState || cookieState !== state || !transaction) {
        throw new Error("invalid login transaction");
      }
      if (transaction.expiresAt < this.#now()) {
        this.#transactions.delete(state);
        throw new Error("expired login transaction");
      }
      const principal = await this.#completeCallback({
        code,
        state,
        codeVerifier: transaction.codeVerifier,
        nonce: transaction.nonce,
      });
      this.#transactions.delete(state);
      const sessionId = randomToken();
      this.#sessions.set(sessionId, {
        id: sessionId,
        principal,
        expiresAt: this.#now() + this.#config.sessionTtlSeconds * 1000,
      });
      const signedSessionId = await this.#signCookieValue(sessionId);
      return new Response(null, {
        status: 302,
        headers: [
          ["location", transaction.returnTo],
          [
            "set-cookie",
            cookie(sessionCookieName, signedSessionId, {
              httpOnly: true,
              sameSite: "Lax",
              secure: true,
              maxAge: this.#config.sessionTtlSeconds,
              path: "/",
            }),
          ],
          [
            "set-cookie",
            cookie(loginCookieName, "", {
              httpOnly: true,
              sameSite: "Lax",
              secure: true,
              maxAge: 0,
              path: "/auth",
            }),
          ],
        ],
      });
    } catch {
      return problemResponse(unauthenticatedProblem());
    }
  }

  async logout(request: Request): Promise<Response> {
    const sessionCookie = parseCookies(request.headers.get("cookie")).get(sessionCookieName);
    if (sessionCookie) {
      const sessionId = await this.#verifyCookieValue(sessionCookie);
      if (sessionId) {
        this.#sessions.delete(sessionId);
      }
    }
    return new Response(null, {
      status: 204,
      headers: {
        "set-cookie": cookie(sessionCookieName, "", {
          httpOnly: true,
          sameSite: "Lax",
          secure: true,
          maxAge: 0,
          path: "/",
        }),
      },
    });
  }

  async authenticateRequest(request: Request): Promise<NormalizedAuthContext> {
    if (this.#config.mode === "local") {
      return this.#localAuthContext();
    }
    const session = await this.#sessionFromRequest(request);
    if (session) {
      return this.#browserAuthContext(session);
    }
    const authorization = request.headers.get("authorization");
    return this.#authenticateBearer(authorization);
  }

  async authenticateWebSocket(
    request?: Request,
    initAuthorization?: string,
  ): Promise<NormalizedAuthContext> {
    if (this.#config.mode === "local") {
      return this.#localAuthContext();
    }
    if (request) {
      const session = await this.#sessionFromRequest(request);
      if (session) {
        return this.#browserAuthContext(session);
      }
    }
    return this.#authenticateBearer(initAuthorization);
  }

  async issueTestBearerToken(input: {
    sub: string;
    scopes?: string[];
    expiresInSeconds?: number;
  }): Promise<string> {
    const issuedAt = Math.floor(this.#now() / 1000);
    const validation = this.#tokenValidationConfig();
    const claims = {
      iss: validation.issuer,
      aud: validation.audience,
      sub: input.sub,
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + (input.expiresInSeconds ?? 300),
      scope: (input.scopes ?? []).join(" "),
    };
    return signJwt(claims, this.#sessionSecret());
  }

  async rememberSelectedProject(request: Request, projectId: string): Promise<void> {
    const selectedProjectId = projectId.trim();
    if (!selectedProjectId) {
      return;
    }
    if (this.#config.mode === "local") {
      this.#localSelectedProjectId = selectedProjectId;
      return;
    }
    const session = await this.#sessionFromRequest(request);
    if (session) {
      session.selectedProjectId = selectedProjectId;
    }
  }

  #localAuthContext(): NormalizedAuthContext {
    return {
      ...localAuthContext(),
      ...(this.#localSelectedProjectId ? { projectId: this.#localSelectedProjectId } : {}),
    };
  }

  async #sessionFromRequest(request: Request): Promise<BrowserSession | null> {
    const value = parseCookies(request.headers.get("cookie")).get(sessionCookieName);
    if (!value) {
      return null;
    }
    const sessionId = await this.#verifyCookieValue(value);
    if (!sessionId) {
      return null;
    }
    const session = this.#sessions.get(sessionId);
    if (!session || session.expiresAt < this.#now()) {
      if (session) {
        this.#sessions.delete(sessionId);
      }
      return null;
    }
    return session;
  }

  async #authenticateBearer(
    authorization: string | null | undefined,
  ): Promise<NormalizedAuthContext> {
    if (!authorization?.startsWith("Bearer ")) {
      throw authGraphQLError("ERR-015");
    }
    try {
      const claims = await verifyJwt(
        authorization.slice("Bearer ".length).trim(),
        this.#sessionSecret(),
      );
      this.#validateClaims(claims);
      const scopes = normalizeScopes(claims);
      const context: NormalizedAuthContext = {
        mode: "service",
        authMode: "sso",
        principalId: claims.sub ?? "",
        scopes,
        readAllowed: scopes.includes("telemetry:read"),
        checkedAt: new Date(this.#now()).toISOString(),
      };
      if (claims.name) {
        context.principalDisplayName = claims.name;
      }
      if (claims.email) {
        context.principalEmail = claims.email;
      }
      if (claims.email && typeof claims.email_verified === "boolean") {
        context.principalEmailVerified = claims.email_verified;
      }
      if (claims.tenant_id) {
        context.tenantId = claims.tenant_id;
      }
      if (claims.company_id) {
        context.companyId = claims.company_id;
      }
      if (claims.project_id) {
        context.projectId = claims.project_id;
      }
      return context;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw authGraphQLError("ERR-015");
    }
  }

  #browserAuthContext(session: BrowserSession): NormalizedAuthContext {
    const context: NormalizedAuthContext = {
      mode: "authenticated",
      authMode: "sso",
      principalId: session.principal.principalId,
      scopes: session.principal.scopes ?? [],
      readAllowed: true,
      checkedAt: new Date(this.#now()).toISOString(),
    };
    if (session.principal.user.displayName) {
      context.principalDisplayName = session.principal.user.displayName;
    }
    if (session.principal.user.email) {
      context.principalEmail = session.principal.user.email;
    }
    if (session.principal.user.email && session.principal.principalEmailVerified === true) {
      context.principalEmailVerified = true;
    }
    if (this.#config.companyId) {
      context.companyId = this.#config.companyId;
    }
    if (session.selectedProjectId) {
      context.projectId = session.selectedProjectId;
    }
    return context;
  }

  #validateClaims(claims: BearerClaims) {
    const now = Math.floor(this.#now() / 1000);
    if (!claims.sub) {
      throw new Error("missing subject");
    }
    const validation = this.#tokenValidationConfig();
    if (claims.iss !== validation.issuer) {
      throw new Error("invalid issuer");
    }
    const expectedAudience = validation.audience;
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!expectedAudience || !audiences.includes(expectedAudience)) {
      throw new Error("invalid audience");
    }
    if (typeof claims.exp !== "number" || claims.exp + clockSkewSeconds < now) {
      throw new Error("expired token");
    }
    if (typeof claims.nbf === "number" && claims.nbf - clockSkewSeconds > now) {
      throw new Error("token not yet valid");
    }
    if (typeof claims.iat === "number" && claims.iat - clockSkewSeconds > now) {
      throw new Error("token issued in future");
    }
  }

  #tokenValidationConfig(): { issuer?: string | undefined; audience?: string | undefined } {
    const provider = this.#config.provider
      ? this.#config.providers?.[this.#config.provider]
      : undefined;
    return {
      issuer: provider?.issuer ?? this.#config.issuer,
      audience:
        provider?.audience ?? provider?.clientId ?? this.#config.audience ?? this.#config.clientId,
    };
  }

  async #completeCallback(input: {
    code: string;
    state: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<AuthenticatedPrincipal> {
    const providerConfig = this.#providerConfig(inputProvider(this.#transactions.get(input.state)));
    if (this.#provider) {
      return this.#provider.completeCallback(input);
    }
    return completeProviderCallback(input, providerConfig, this.#fetch, this.#now);
  }

  #authorizationUrl(transaction: LoginTransaction, providerConfig: AuthProviderRuntimeConfig): URL {
    const url = new URL(
      this.#provider?.authorizationEndpoint ??
        providerProfile(providerConfig).authorizationEndpoint,
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", providerConfig.clientId);
    url.searchParams.set("redirect_uri", providerConfig.redirectUri);
    url.searchParams.set(
      "scope",
      providerConfig.provider === "github" ? "read:user user:email" : "openid profile email",
    );
    url.searchParams.set("state", transaction.state);
    if (providerConfig.provider !== "github") {
      url.searchParams.set("nonce", transaction.nonce);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("code_challenge", pkceChallenge(transaction.codeVerifier));
    }
    return url;
  }

  #providerName(value: string | null): AuthProvider {
    const provider = value ?? this.#config.provider;
    if (provider !== "github" && provider !== "google" && provider !== "azure") {
      throw new Error("SSO provider is not configured");
    }
    this.#providerConfig(provider);
    return provider;
  }

  #providerConfig(provider: AuthProvider): AuthProviderRuntimeConfig {
    const configured = this.#config.providers?.[provider];
    if (configured) {
      return configured;
    }
    throw new Error("SSO provider is not configured");
  }

  async #signCookieValue(value: string): Promise<string> {
    return `${value}.${await hmac(value, this.#sessionSecret())}`;
  }

  async #verifyCookieValue(value: string): Promise<string | null> {
    const index = value.lastIndexOf(".");
    if (index < 1) {
      return null;
    }
    const unsigned = value.slice(0, index);
    const signature = value.slice(index + 1);
    const expected = await hmac(unsigned, this.#sessionSecret());
    return signature === expected ? unsigned : null;
  }

  #sessionSecret(): string {
    return this.#config.sessionSecret ?? "cloudgrid-local-session-secret";
  }
}

export function localAuthContext(): NormalizedAuthContext {
  return {
    mode: "anonymous",
    authMode: "local",
    principalId: "local-user",
    tenantId: "local",
    companyId: "local",
    projectId: "default",
    scopes: [],
    ingestAllowed: true,
    readAllowed: true,
    checkedAt: new Date().toISOString(),
  };
}

export function requireScopes(context: NormalizedAuthContext, scopes: string[]) {
  for (const scope of scopes) {
    if (!context.scopes?.includes(scope) && context.authMode !== "local") {
      throw authGraphQLError("ERR-016");
    }
  }
}

export function authGraphQLError(id: "ERR-015" | "ERR-016"): GraphQLError {
  const problem = createProblemDetails({ id });
  return new GraphQLError(problem.detail, {
    extensions: {
      code: problem.code,
      problem,
    },
  });
}

export function unauthenticatedProblem(): ProblemDetails {
  return createProblemDetails({ id: "ERR-015" });
}

export function problemResponse(problem: ProblemDetails): Response {
  return Response.json(problem, {
    status: problem.status,
    headers: { "content-type": "application/problem+json" },
  });
}

function inputProvider(transaction: LoginTransaction | undefined): AuthProvider {
  if (!transaction) {
    throw new Error("invalid login transaction");
  }
  return transaction.provider;
}

function providerProfile(config: AuthProviderRuntimeConfig): {
  authorizationEndpoint: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  jwksUrl?: string;
} {
  if (config.provider === "github") {
    return {
      authorizationEndpoint: "https://github.com/login/oauth/authorize",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
    };
  }
  if (config.provider === "azure") {
    const issuer = trimEnd(config.issuer ?? "", "/");
    const base = trimEnd(issuer.endsWith("/v2.0") ? issuer.slice(0, -"/v2.0".length) : issuer, "/");
    return {
      authorizationEndpoint: `${base}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${base}/oauth2/v2.0/token`,
      userInfoEndpoint: "https://graph.microsoft.com/oidc/userinfo",
      jwksUrl: config.jwksUrl ?? `${base}/discovery/v2.0/keys`,
    };
  }
  return {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    jwksUrl: config.jwksUrl ?? "https://www.googleapis.com/oauth2/v3/certs",
  };
}

async function completeProviderCallback(
  input: { code: string; state: string; codeVerifier: string; nonce: string },
  config: AuthProviderRuntimeConfig,
  fetcher: typeof fetch,
  now: () => number,
): Promise<AuthenticatedPrincipal> {
  return config.provider === "github"
    ? completeGithubCallback(input, config, fetcher)
    : completeOidcCallback(input, config, fetcher, now);
}

async function completeGithubCallback(
  input: { code: string },
  config: AuthProviderRuntimeConfig,
  fetcher: typeof fetch,
): Promise<AuthenticatedPrincipal> {
  if (!config.clientSecret) {
    throw new Error("GitHub OAuth requires a client secret");
  }
  const token = await postToken(fetcher, "https://github.com/login/oauth/access_token", {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: config.redirectUri,
  });
  const user = await fetchJson<GithubUser>(
    fetcher,
    "https://api.github.com/user",
    token.access_token,
  );
  const emails = await fetchJson<GithubEmail[]>(
    fetcher,
    "https://api.github.com/user/emails",
    token.access_token,
  );
  const verifiedEmails = emails.filter((item) => item.verified);
  const email =
    verifiedEmails.find((item) => item.primary)?.email ??
    verifiedEmails[0]?.email ??
    user.email ??
    null;
  const name = user.name || user.login;
  const id = `github:${user.id}`;
  const principalEmailVerified =
    email !== null &&
    verifiedEmails.some((item) => item.email.toLowerCase() === email.toLowerCase());
  return {
    principalId: id,
    user: { id, displayName: name, email },
    principalEmailVerified,
    scopes: ["telemetry:read", "telemetry:live"],
  };
}

async function completeOidcCallback(
  input: { code: string; codeVerifier: string; nonce: string },
  config: AuthProviderRuntimeConfig,
  fetcher: typeof fetch,
  now: () => number,
): Promise<AuthenticatedPrincipal> {
  const profile = providerProfile(config);
  const token = await postToken(fetcher, profile.tokenEndpoint ?? "", {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
  if (!token.id_token) {
    throw new Error("missing id token");
  }
  const verifyOptions: RemoteJwtVerifyOptions = {
    issuer: config.issuer,
    audience: config.audience ?? config.clientId,
    nonce: input.nonce,
    jwksUrl: profile.jwksUrl,
    fetcher,
    now,
  };
  const idClaims = await verifyRemoteJwt(token.id_token, verifyOptions);
  const userInfo = profile.userInfoEndpoint
    ? await fetchJson<OidcUserInfo>(fetcher, profile.userInfoEndpoint, token.access_token)
    : {};
  const subject = stringClaim(userInfo.sub) ?? stringClaim(idClaims.sub);
  if (!subject) {
    throw new Error("missing subject");
  }
  const displayName =
    stringClaim(userInfo.name) ??
    stringClaim(idClaims.name) ??
    stringClaim(userInfo.email) ??
    subject;
  const email = stringClaim(userInfo.email) ?? stringClaim(idClaims.email) ?? null;
  const principalEmailVerified =
    email !== null &&
    (booleanClaim(userInfo.email_verified) === true ||
      booleanClaim(idClaims.email_verified) === true);
  const id = `${config.provider}:${subject}`;
  return {
    principalId: id,
    user: { id, displayName, email },
    principalEmailVerified,
    scopes: ["telemetry:read", "telemetry:live"],
  };
}

async function postToken(
  fetcher: typeof fetch,
  url: string,
  body: Record<string, string | undefined>,
): Promise<TokenResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value) {
      params.set(key, value);
    }
  }
  const response = await fetcher(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) {
    throw new Error("token exchange failed");
  }
  return response.json() as Promise<TokenResponse>;
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, accessToken: string): Promise<T> {
  const response = await fetcher(url, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("profile fetch failed");
  }
  return response.json() as Promise<T>;
}

async function verifyRemoteJwt(
  token: string,
  options: RemoteJwtVerifyOptions,
): Promise<BearerClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || !options.jwksUrl || !options.issuer || !options.audience) {
    throw new Error("invalid id token");
  }
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0] ?? "")));
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("unsupported id token");
  }
  const jwks = await fetchJwks(options.fetcher, options.jwksUrl);
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error("missing signing key");
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    bufferSource(base64UrlDecode(parts[2] ?? "")),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) {
    throw new Error("invalid id token signature");
  }
  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[1] ?? "")),
  ) as BearerClaims;
  validateOidcClaims(claims, {
    issuer: options.issuer ?? "",
    audience: options.audience ?? "",
    nonce: options.nonce,
    now: options.now,
  });
  return claims;
}

interface RemoteJwtVerifyOptions {
  issuer?: string | undefined;
  audience?: string | undefined;
  nonce: string;
  jwksUrl?: string | undefined;
  fetcher: typeof fetch;
  now: () => number;
}

async function fetchJwks(fetcher: typeof fetch, url: string): Promise<JsonWebKeySet> {
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error("jwks fetch failed");
  }
  return response.json() as Promise<JsonWebKeySet>;
}

function validateOidcClaims(
  claims: BearerClaims,
  options: { issuer: string; audience: string; nonce: string; now: () => number },
) {
  const now = Math.floor(options.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (claims.iss !== options.issuer || !audiences.includes(options.audience)) {
    throw new Error("invalid id token claims");
  }
  if (claims.nonce !== options.nonce) {
    throw new Error("invalid nonce");
  }
  if (!claims.sub || typeof claims.exp !== "number" || claims.exp + clockSkewSeconds < now) {
    throw new Error("expired id token");
  }
  if (typeof claims.nbf === "number" && claims.nbf - clockSkewSeconds > now) {
    throw new Error("id token not yet valid");
  }
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function booleanClaim(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
}

interface GithubUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
}

interface GithubEmail {
  email: string;
  primary?: boolean;
  verified?: boolean;
}

interface OidcUserInfo {
  sub?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
}

interface JsonWebKeySet {
  keys: Array<JsonWebKey & { kid?: string }>;
}

function sanitizeReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/projects";
  }
  return value;
}

function cookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    sameSite: "Lax";
    secure: boolean;
    maxAge: number;
    path: string;
  },
): string {
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    options.httpOnly ? "HttpOnly" : "",
    options.secure ? "Secure" : "",
    `SameSite=${options.sameSite}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const [name, ...rest] = part.trim().split("=");
    if (name) {
      cookies.set(name, rest.join("="));
    }
  }
  return cookies;
}

function normalizeScopes(claims: BearerClaims): string[] {
  if (Array.isArray(claims.scopes)) {
    return claims.scopes;
  }
  if (Array.isArray(claims.scope)) {
    return claims.scope;
  }
  if (typeof claims.scope === "string") {
    return claims.scope.split(" ").filter(Boolean);
  }
  return [];
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function pkceChallenge(verifier: string): string {
  return base64Url(new Bun.CryptoHasher("sha256").update(verifier).digest());
}

async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = await hmac(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

async function verifyJwt(token: string, secret: string): Promise<BearerClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("malformed token");
  }
  const header = parts[0] ?? "";
  const payload = parts[1] ?? "";
  const signature = parts[2] ?? "";
  const parsedHeader = JSON.parse(new TextDecoder().decode(base64UrlDecode(header)));
  if (parsedHeader?.alg !== "HS256") {
    throw new Error("unsupported token algorithm");
  }
  if ((await hmac(`${header}.${payload}`, secret)) !== signature) {
    throw new Error("invalid token signature");
  }
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as BearerClaims;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function bufferSource(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function trimEnd(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}
