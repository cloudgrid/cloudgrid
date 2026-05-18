# Architecture

This numbered architecture page is kept for compatibility. The current architecture pages are:

- [Architecture overview](../architecture/README.md)
- [Service boundaries](../architecture/service-boundaries.md)
- [Ingest flow](../architecture/ingest-flow.md)
- [Read flow](../architecture/read-flow.md)
- [Live trace flow](../architecture/live-trace-flow.md)
- [Tenancy and security](../architecture/tenancy-security.md)

The core rule remains: public and ingress-facing services do not access SurrealDB directly.
