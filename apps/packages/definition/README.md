# Definition Package

Shared TypeScript definitions for CloudGrid contracts.

This package must not depend on apps, runtime, HTTP frameworks, React, SurrealDB, or Go services.

Target state: define message and entity contract metadata here, then generate
AsyncAPI, `apps/packages/ui-contracts`, and `core/go-contracts` from the same
definitions. Until that generator exists, the spec contract files remain the
checked source of truth.
