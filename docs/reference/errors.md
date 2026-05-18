# Errors

CloudGrid errors are defined in `specs/03-contracts/errors.yaml`.

Public HTTP errors use RFC 9457 Problem Details with CloudGrid extension members `id`, `code`, `retryable`, and optional `details`. Public GraphQL errors use `GraphQLError.extensions.code` and expose the problem object at `GraphQLError.extensions.problem`.

## Core Error Codes

| ID | Code | Meaning |
| --- | --- | --- |
| `ERR-001` | `VALIDATION_FAILED` | Input, timestamp, query, or OTLP record validation failed. |
| `ERR-002` | `UNSUPPORTED_MEDIA_TYPE` | OTLP ingest content type is not supported. |
| `ERR-003` | `INVALID_CURSOR` | Pagination cursor cannot be decoded or does not match expected sort fields. |
| `ERR-004` | `TRACE_NOT_FOUND` | Requested trace ID does not exist. |
| `ERR-005` | `METHOD_NOT_ALLOWED` | Unsupported HTTP method. |
| `ERR-006` | `STORAGE_UNAVAILABLE` | SurrealDB cannot be reached or rejects connection. |
| `ERR-007` | `PARTIAL_WRITE` | Non-transactional write may have partially persisted. |
| `ERR-008` | `OTLP_DECODE_FAILED` | OTLP JSON or protobuf payload could not be decoded. |
| `ERR-009` | `CONFIG_INVALID` | Runtime configuration failed validation. |
| `ERR-010` | `RUNTIME_COMPOSITION_FAILED` | Required module or adapter is missing. |
| `ERR-011` | `STATIC_ASSET_NOT_FOUND` | Requested frontend asset does not exist. |
| `ERR-012` | `REQUEST_TIMEOUT` | Server-side timeout. |
| `ERR-013` | `MESSAGE_BRIDGE_UNAVAILABLE` | NATS or JetStream is unavailable. |
| `ERR-014` | `MESSAGE_BRIDGE_TIMEOUT` | Request/reply did not receive a response in time. |
| `ERR-015` | `UNAUTHENTICATED` | Authentication is required. |
| `ERR-016` | `FORBIDDEN` | Principal cannot access the requested project or operation. |
| `ERR-017` | `SUBSCRIPTION_LIMIT_EXCEEDED` | Too many live telemetry subscriptions are open. |
| `ERR-018` | `ALERT_RULE_INVALID` | Alert rule configuration failed validation. |
| `ERR-019` | `ALERT_QUERY_UNSUPPORTED` | Alert query cannot run through storage-read contracts. |
| `ERR-020` | `ALERT_NOTIFICATION_FAILED` | Notification adapter delivery failed. |
| `ERR-021` | `ALERT_EVALUATOR_TIMEOUT` | Alert evaluator exceeded deadline. |
| `ERR-022` | `INVITATION_EMAIL_DELIVERY_FAILED` | Invitation email enqueue or SMTP delivery failed. |

## AI Evaluation Error Codes

| ID | Code | Meaning |
| --- | --- | --- |
| `ERR-AIE-001` | `EVAL_DATASET_NOT_FOUND` | Required dataset, version, or item does not exist. |
| `ERR-AIE-002` | `EVAL_SCORER_NOT_FOUND` | Required scorer or scorer version does not exist. |
| `ERR-AIE-003` | `EVAL_HARNESS_UNREACHABLE` | Harness adapter is unavailable. |
| `ERR-AIE-004` | `EVAL_RUN_LIMIT_EXCEEDED` | Budget, concurrency, item count, or sampling limit blocked the run. |
| `ERR-AIE-005` | `EVAL_PROJECTION_AMBIGUOUS` | OTel GenAI and OpenInference fields produced ambiguous projection. |
| `ERR-AIE-006` | `EVAL_CONTENT_NOT_CAPTURED` | Selected span does not contain captured content. |

## Logging Rule

Mapped failures should include `error_id` and `error_code` in structured logs, but raw provider errors, tokens, cookies, SurrealDB credentials, and raw OTLP bodies must not be logged by default.
