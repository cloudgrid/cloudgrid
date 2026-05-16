# CloudGrid AI-Eval Runner

This module contains the dependency-light orchestration core for
`core/ai-eval-runner`.

The full service is specified in:

- `specs/04-backend/ai-eval-runner.md`
- `specs/04-backend/ai-eval-message-contracts.md`
- `specs/99-reviews/ai-eval-implementation-scope.md`

## Current Scope

This module intentionally contains only dependency-light code:

- idempotency key helpers for the persistence boundary tuples declared in the runner spec;
- a deterministic exact-JSON scorer helper for local scorer tests;
- ports for storage-read queries, storage-write persistence, harness adapter calls, and durable progress publishing;
- orchestration for offline experiment starts, cancellation state, local deterministic scoring, non-deterministic scoring through the harness adapter interface, optimization delegation through the harness adapter interface, and durable progress publication.

It does not import NATS, SurrealDB, harness adapter packages, model-provider SDKs, or generated contracts. NATS and HTTP implementations belong behind the declared ports.

## Local Tests

Run the module tests from the repository root:

```sh
go test ./core/ai-eval-runner/...
```
