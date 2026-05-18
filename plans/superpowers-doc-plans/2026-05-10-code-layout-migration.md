# Code Layout Migration Implementation Plan

> Status: superseded by current repository layout. Do not treat the unchecked
> boxes as pending work; `apps/` and `core/` are already the active layout. This
> file remains historical planning context only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move implementation code into a clean `apps` and `core` structure while keeping specs, docs, tooling, and skills at the repository root.

**Architecture:** `apps/` owns the public application layer and TypeScript app packages. `core/` owns all Go services and Go shared packages. Root directories continue to hold specs, docs, fixture data, tooling, and agent guidance.

**Tech Stack:** Bun, TypeScript, Vite, Biome, Go workspaces, NATS, SurrealDB.

---

### Task 1: Move Implementation Directories

**Files:**
- Verify: `apps/packages/definition`
- Verify: `apps/packages/otlp`
- Verify: `apps/packages/runtime`
- Verify: `apps/packages/ui-contracts`
- Move: `core/go-contracts` to `core/go-contracts`
- Move: `core/go-runtime` to `core/go-runtime`
- Move: `core/otlp-collector` to `core/otlp-collector`
- Move: `core/storage-read` to `core/storage-read`
- Move: `core/storage-write` to `core/storage-write`

- [ ] Move directories with `mkdir -p apps/packages core` and `mv` so git records renames.
- [ ] Update `go.work` to use `./core/go-contracts`, `./core/go-runtime`, and the three Go services.
- [ ] Verify Go module names and imports use `github.com/cloudgrid-dev/cloudgrid/core/*`.
- [ ] Update Go `replace` paths to the new relative locations.

### Task 2: Align TypeScript Workspace Paths

**Files:**
- Modify: root `package.json`
- Modify: TypeScript package manifests and tsconfigs under `apps/packages/*`
- Modify: `apps/backend/*`, `apps/frontend/*`
- Modify: import paths and README references that target `apps/packages/*`

- [ ] Update root scripts from `packages/<name>` to `apps/packages/<name>`.
- [ ] Update package-local relative paths after the move.
- [ ] Update imports, docs, tests, and generated contract references to use `apps/packages/*`.

### Task 3: Align Specs, Docs, Tooling, And Agent Guidance

**Files:**
- Modify: `AGENTS.md`, `CLAUDE.md`, `.agent/IMPLEMENTATION.md`
- Modify: `specs/**/*.md`, `specs/**/*.yaml`, `specs/**/*.json`
- Modify: `docs/**/*.md`, `tooling/**/*.mjs`, `tooling/**/*.md`

- [ ] Replace old path references with the new layout.
- [ ] Preserve the hard boundaries: frontend to BFF only, BFF to private services through NATS, storage-read owns reads, storage-write owns writes.
- [ ] Update expected commands and coverage commands to use `core/*` and `apps/packages/*`.

### Task 4: Raise Backend Coverage

**Files:**
- Add or modify focused tests under `apps/backend/src`
- Add or modify focused tests under `core/otlp-collector`, `core/storage-read`, `core/storage-write`, and `core/go-runtime`

- [ ] Run coverage and identify undercovered backend packages.
- [ ] Add behavior tests for low-risk public functions, configuration paths, error handling, query builders, and handlers.
- [ ] Keep frontend coverage exempt from the >80% target.
- [ ] Re-run coverage and record exact totals.

### Task 5: Verification

**Files:**
- No new files expected.

- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run test`.
- [ ] Run `bun run contracts:check`.
- [ ] Run `bun run build`.
- [ ] Run `go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/...`.
- [ ] Run backend coverage commands and verify non-frontend backend coverage is above 80%, or report any exact blocker.
- [ ] Run `git diff --check`.
