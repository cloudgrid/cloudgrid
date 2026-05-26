# Organization Invitations Implementation Plan

> Status: superseded by current implementation. Do not execute the unchecked
> boxes as pending work without first re-auditing the current contracts,
> control-plane, BFF, frontend, and docs. This file remains historical planning
> context only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement invite-only organization membership end to end with pending email invitations accepted by matching verified SSO identity.

**Architecture:** Control-plane owns invitation persistence and SSO acceptance. The TypeScript BFF exposes GraphQL and NATS bridge methods without applying membership business rules. The frontend Members settings view lists active members and pending invitations, with admin-only invite and revoke actions.

**Tech Stack:** Go control-plane service and stores, AsyncAPI/GraphQL contracts, TypeScript BFF, React/Vite frontend, Bun tests, Go tests.

---

## Source Specs

- `specs/spec.md`
- `specs/04-backend/organization-invitations.md`
- `specs/04-backend/control-plane.md`
- `specs/04-backend/authentication-authorization.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/views.md`

## Task 1: Control-Plane Invitation Persistence And Lifecycle

**Files:**
- Modify: `core/control-plane/internal/ports/store.go`
- Modify: `core/control-plane/internal/adapters/memory/store.go`
- Modify: `core/control-plane/internal/adapters/surrealdb/query.go`
- Modify: `core/control-plane/internal/service.go`
- Modify: `core/control-plane/internal/service_test.go`
- Modify: `core/control-plane/internal/nats.go`
- Modify: `core/control-plane/internal/nats_adapter.go`
- Modify: `core/control-plane/internal/nats_test.go`

- [ ] Write failing Go tests in `core/control-plane/internal/service_test.go` for admin invite, non-admin denial, duplicate normalized email denial, existing member denial, SSO acceptance as `user`, no invite means no membership, unverified email does not accept, revoked/expired invitations do not accept, accepted invite cannot be revoked.
- [ ] Run `go test ./core/control-plane/...` and verify the new tests fail because invitation APIs are missing.
- [ ] Add `InvitationRecord` and store methods for get/list/put/pending-by-email in ports, memory store, and SurrealDB adapter.
- [ ] Add service methods `ListMembers`, `ListInvitations`, `CreateInvitation`, `RevokeInvitation`, and SSO bootstrap acceptance logic exactly as specified.
- [ ] Change `UpdateMember` so it only updates existing active memberships and never creates unknown members.
- [ ] Add NATS handlers and subject registration for `control.members.list`, `control.invitations.list`, `control.invitations.create`, and `control.invitations.revoke`.
- [ ] Re-run `go test ./core/control-plane/...` and the broader Go command for touched Go contract/control-plane packages.

## Task 2: BFF GraphQL And Bridge Integration

**Files:**
- Modify: `apps/backend/src/auth.ts`
- Modify: `apps/backend/src/bridge.ts`
- Modify: `apps/backend/src/graphql.ts`
- Modify: `apps/backend/src/validation.ts`
- Modify: `apps/backend/src/graphql-control.test.ts`
- Modify: `apps/backend/src/bridge.test.ts`
- Modify: `apps/backend/src/auth.test.ts`
- Modify: `apps/backend/src/test-helpers.ts`

- [ ] Write failing Bun tests for `organizationMembers`, `organizationInvitations`, `inviteOrganizationMember`, and `revokeOrganizationInvitation` GraphQL operations and NATS subjects.
- [ ] Write a failing auth test proving verified provider email is forwarded in the normalized auth context.
- [ ] Run the narrow backend tests and verify they fail because resolvers/bridge/auth fields are missing.
- [ ] Add `principalEmailVerified` to normalized auth context and bridge envelope mapping.
- [ ] Add BFF bridge methods for member list and invitation list/create/revoke using generated contract shapes.
- [ ] Add GraphQL resolvers and input validation for the new fields and mutations.
- [ ] Re-run narrow backend tests plus `bun run contracts:check`.

## Task 3: Frontend Members UX

**Files:**
- Modify: `apps/frontend/src/lib/graphql-client.ts`
- Modify: `apps/frontend/src/lib/query-keys.ts`
- Modify: `apps/frontend/src/lib/i18n.ts`
- Modify: `apps/frontend/src/routes/control-plane-routes.tsx`
- Modify or add frontend tests if matching route tests already exist.

- [ ] Write failing TypeScript/frontend tests where existing test harnesses cover control-plane client or member UI behavior.
- [ ] Add GraphQL client methods and operations for members and invitations.
- [ ] Update the Members route to query active members and invitations separately, show admin-only Invite member sheet, create email-only `user` invitations, revoke pending invitations, and keep promotion controls on active users only.
- [ ] Add i18n strings for invitation labels, empty states, validation, and actions.
- [ ] Re-run frontend/package typecheck.

## Task 4: Docs, Specs, Contracts, And Verification

**Files:**
- Modify: `website/src/content/handbook/` user/operator docs for SSO member administration if an existing auth/admin doc exists.
- Modify: `specs/.readiness-report.yaml`
- Modify generated contract outputs only through `bun run contracts:generate`.

- [ ] Add docs explaining invite-only SSO membership, pending invites, admin promotion after sign-in, and SSO deprovisioning policy status.
- [ ] Regenerate contracts if schema/definition changes are needed.
- [ ] Run `bun run contracts:check`, targeted Bun typechecks/tests, Go tests for control-plane/go-contracts, and `git diff --check`.
- [ ] Verify no touched spec/doc contains unresolved placeholder wording.
