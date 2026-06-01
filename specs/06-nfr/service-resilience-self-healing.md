---
id: NFR-009
title: Service resilience and self-healing
category: reliability
status: draft
provenance: observed-gap
target: 100 percent of recoverable request, message, NATS, and SurrealDB failures are contained to the failing operation; service readiness reflects local dependency health without cascading across services
measurement: Unit, integration, and local chaos tests that force invalid messages, handler panics, NATS reconnects, JetStream fetch failures, SurrealDB disconnects, readiness degradation and recovery, and graceful shutdown
applies_to: [TEC-BE-001, TEC-BE-005, NFR-002]
enforcement: blocking
---

# Service Resilience And Self-Healing

CloudGrid services must treat malformed input, broken client requests,
temporary message-bridge outages, temporary SurrealDB outages, callback panics,
stale subscriptions, and unknown write outcomes as isolated failures. A single
invalid request, invalid message, unavailable dependency, or unexpected handler
bug must not permanently wedge a service, leak goroutines, or require manual
process replacement unless the failure is explicitly classified as fatal.

Fail-fast startup remains correct for invalid configuration, missing required
schema, incompatible compiled adapter selection, listener bind failures, and
unrecoverable contract drift. Runtime failure behavior is different: after a
service has reached readiness, transient NATS or SurrealDB failures must degrade
readiness, return canonical retryable errors, retry where the operation is
idempotent, and recover readiness when the local dependency recovers.

## Failure Classes

| Class | Examples | Required behavior |
| --- | --- | --- |
| Client/input validation | malformed OTLP, malformed GraphQL variables, malformed NATS request JSON, invalid dashboard widget data | Reject the operation with `ERR-001`; do not retry; do not crash; do not close dependency clients. |
| Response contract validation | service reply does not match AsyncAPI/GraphQL bridge schema | BFF returns `ERR-023 RESPONSE_CONTRACT_INVALID`, not `MESSAGE_BRIDGE_UNAVAILABLE`; log subject, response path, and request ID without raw payload or secrets. |
| Retryable NATS transport | disconnected, reconnecting, request timeout before response, JetStream temporarily unavailable, publish ack timeout | Degrade readiness for the local NATS check; return `ERR-013` or `ERR-014` according to the taxonomy; reconnect or rebind using bounded backoff; do not terminate the process unless retry budget is exhausted by policy. |
| Retryable SurrealDB transport | query timeout, websocket disconnect, authentication token/session expiry, temporary unavailable database | Degrade readiness for the local storage check; return `ERR-006`; reopen and reauthenticate the adapter connection with bounded backoff; do not silently fall back to memory or another store. |
| Retryable persistence command | storage-write duplicate check or persist fails after a valid command | `NakWithDelay` using bounded backoff; ack only after successful persistence or terminal non-retryable validation classification. |
| Unknown write outcome | storage-write loses SurrealDB connection or context is canceled while a write may have reached the database | Treat as retryable; do not ack; redelivery must use command idempotency checks before attempting another write. |
| Stale realtime path | BFF sink subscription, storage-read live registry entry, heartbeat loop, or stop request is orphaned by disconnect/reconnect/shutdown | Bounded cleanup must remove local state; repeated stop failures are logged but do not block shutdown indefinitely. |
| Event-loop or worker starvation | synchronous JSON/Zod work on large payloads, broad readiness checks, unbounded goroutines, long mutex waits, blocking network calls without context | Bound work by size, time, concurrency, and queue depth; degrade or reject when saturated instead of blocking unrelated operations. |
| Terminal command failure | invalid ingest command, invalid AI write command, schema-incompatible command payload | Ack or park according to stream policy; log `ERR-001`; never redeliver indefinitely. |
| Handler panic | panic inside NATS request/reply handler, live notification handler, JetStream message handler, invitation-email worker, or self-observability callback | Recover at the callback boundary; log structured `error`; respond with canonical internal/bridge error when possible; NAK unacked stream messages when retryable; keep process running. |
| Fatal process condition | invalid config, missing required startup schema, incompatible adapter build, listener bind failure, unrecoverable runtime invariant corruption | Log structured fatal error and exit non-zero. Rely on the orchestrator to restart only for fatal process conditions. |

## Health Model

Every service must expose:

- `/livez`: process liveness only. It returns `200` while the process event loop
  can accept local HTTP health requests, even when NATS or SurrealDB is down.
- `/readyz`: local readiness only. It reports whether this process can perform
  its own responsibilities with its directly owned dependencies.

Health checks must not call another CloudGrid service's health endpoint. This
prevents cascading readiness failures. For example, the collector readiness
checks NATS JetStream ingest subjects but does not check storage-write health;
storage-read readiness checks its SurrealDB reader and NATS responder state but
does not check the BFF.

Readiness details must be dependency-specific:

- `nats`: current connection status is connected, not merely not closed; a
  flush or equivalent operation with a short timeout succeeds; request/reply
  responders or JetStream consumers required by the service are registered.
- `jetstream`: stream and durable consumer state required by the service is
  available when the service uses JetStream.
- `surrealdb` or `control-store`: the adapter can run a bounded readiness query
  against the selected namespace/database and required schema/index checks pass.
- `http_listener` and `grpc_listener`: local listeners are bound when the
  service exposes public OTLP listeners.
- `self-observability`: only static configuration and configured local
  project/company existence checks may affect readiness. Export delivery
  failures must never affect readiness.

Readiness checks must be bounded to one second at the health layer and must not
hold global adapter locks long enough to starve normal request handling. A
readiness check must not run schema initialization, long migrations, broad data
queries, or calls that can mutate data. If an adapter requires a shared SDK
client lock, the health path must use a short try/bounded lock or a separate
readiness connection so readiness probing cannot create a production traffic
head-of-line block.

Readiness may be degraded during startup ordering. For local Compose and
development, services may start before NATS or SurrealDB is available if their
configuration is valid; they must keep retrying startup dependency connection
with bounded backoff and report `/livez=ok`, `/readyz=degraded`. Deployed
packaging may still choose fail-fast startup, but the runtime behavior after
first readiness must follow this spec. The chosen startup mode must be explicit
per service and covered by tests.

## NATS Runtime Requirements

All NATS adapters must configure connection callbacks for disconnected,
reconnected, discovered server, closed, and async error events. These callbacks
must update local connection state and emit low-frequency structured logs:

- `nats_disconnected`
- `nats_reconnected`
- `nats_closed`
- `nats_async_error`
- `nats_subscriptions_rebound` when service-owned subscriptions are rebound

NATS clients must use explicit reconnect settings from runtime configuration.
Default behavior is to retry while the process is running. Reconnect attempts
must use bounded wait with jitter where the client allows it. A closed
connection caused by exhausted reconnect attempts is a fatal local dependency
state for readiness, but must not panic or corrupt in-flight request handling.

Request/reply subscribers must recover from callback panics, respond with a
canonical error when a reply subject exists, and keep the subscription alive.
If the incoming message has no reply subject, the handler logs the recovered
failure and returns without attempting a response.

Storage-write JetStream consumers must classify `Fetch` errors. Timeouts are
normal polling behavior. Temporary disconnect, reconnecting, no responders,
server unavailable, and publish/ack timeout errors are retryable and must keep
the consumer loop alive with bounded backoff. Consumer configuration conflicts,
missing stream after provisioning, and schema-incompatible message types are
fatal or terminal according to their class.

After NATS reconnect, services must prove owned subscriptions are active before
readiness returns to `ok`. If the NATS client preserves subscriptions
automatically, the service still performs a bounded `Flush` and, where
applicable, checks the stream/consumer state. If the service must resubscribe,
it must cancel old heartbeat/background loops before creating replacement loops.

The TypeScript BFF NATS adapter must classify NATS errors before mapping them
to GraphQL problems:

- no responders, connection closed, reconnecting, permission violation, and
  publish/request setup failures map to `ERR-013`;
- request timeout maps to `ERR-014`;
- payload decode failure or response envelope parse failure maps to
  `ERR-023 RESPONSE_CONTRACT_INVALID`, not transport outage;
- subscription iterator failures close only the affected GraphQL subscription
  and trigger best-effort stop cleanup.

BFF health must check the NATS lifecycle state with the same semantics as Go
services: connected and operational, not merely `isClosed() == false`.

## Async, Blocking, And Saturation Requirements

CloudGrid must make blocking behavior explicit. A resilience implementation is
not complete if it only reconnects dependencies while allowing health checks,
JSON validation, queue consumers, live subscriptions, or shutdown cleanup to
starve the process.

Every service must define and test these local budgets:

- maximum concurrent request/reply handler executions per process where the
  transport can otherwise invoke unbounded callbacks;
- maximum concurrent storage-write persist workers;
- maximum concurrent SurrealDB queries per adapter or process when the SDK does
  not provide its own safe pool/backpressure;
- maximum live subscriptions and per-subscription queued events;
- maximum self-observability exporter queue length;
- maximum shutdown drain duration;
- maximum health-check duration and lock wait;
- maximum JSON/body bytes and maximum response-validation issue count logged.

When a budget is exhausted, the service must return a canonical retryable error
where the operation can be retried (`ERR-013`, `ERR-014`, or `ERR-006` according
to the failing dependency) or a non-retryable validation error when the caller
exceeded an input limit. It must not create unbounded goroutines, channels,
timers, or in-memory queues.

TypeScript BFF requirements:

- public HTTP and GraphQL request bodies are bounded before parse/validation;
- response validation logs cap issue count and path depth;
- GraphQL subscriptions use bounded async queues and clear watchdog timers in
  all normal, error, and cancellation paths;
- NATS subscription callbacks catch async errors so one failed sink message does
  not terminate unrelated subscriptions;
- CPU-heavy validation or response normalization must not run over unbounded
  arrays. Existing GraphQL and bridge contracts must enforce page/limit values
  before response mapping;
- health checks must not wait behind long GraphQL requests or subscription
  cleanup.

Go service requirements:

- every database and NATS operation must receive a context with deadline or run
  under an already bounded parent context;
- goroutine fan-out must use bounded worker pools or semaphores;
- `time.Ticker` and `time.Timer` values must be stopped when their owner stops;
- mutexes guarding SDK clients or registries must not be held while performing
  slow network I/O unless there is a documented reason and a bounded context;
- NATS callbacks must return quickly. Long work must move to bounded workers
  with backpressure;
- logs emitted from retry loops, heartbeat failures, and validation failures
  must be rate-limited or state-change based to avoid log storms during
  outages.

Readiness checks are not allowed to be load tests. They must prove operational
dependency health with minimal bounded work and must not amplify an outage by
creating heavy DB/NATS traffic.

## SurrealDB Runtime Requirements

SurrealDB adapters must own a reconnecting client manager behind the existing
adapter ports. The manager must:

- keep SurrealDB credentials private to storage/control-plane processes;
- open the client, select namespace/database, authenticate, and reselect the
  namespace/database as one connection-establishment operation;
- classify connection, authentication, namespace/database selection, query
  timeout, and closed-client errors as `ERR-006`;
- use bounded exponential backoff with jitter for reconnect attempts;
- make normal operations fail fast with retryable `ERR-006` while reconnecting;
- re-run readiness checks before reporting ready after reconnect;
- re-run schema initialization only for services that own schema initialization
  and only with idempotent schema statements;
- never fall back to in-memory state, alternate databases, or stale cached query
  responses unless a separate spec explicitly defines that behavior.

Storage-write must not ack a message when SurrealDB persistence is uncertain.
If a persist call returns an unknown commit state, the handler must prefer
redelivery and rely on command idempotency checks before a later write.

SurrealDB adapters must avoid global package locks for all query traffic. Any
required namespace/database `Use` serialization must be scoped to the client
manager, bounded by context, and designed so a slow readiness check cannot block
unrelated reads or writes indefinitely. Adapter tests must include lock
contention or slow-readiness fakes.

Schema readiness and schema initialization are separate operations:

- readiness verifies required schema and indexes;
- initialization creates or updates schema only in services that own that
  responsibility;
- reconnect may re-run idempotent initialization only for storage-write and
  control-plane, not storage-read;
- storage-read never attempts to repair schema during readiness.

## Panic And Goroutine Safety

Every goroutine started by service composition must have an owner and a stop
path. Long-lived goroutines include health servers, NATS callback processors,
JetStream worker pools, live trace heartbeat loops, invitation email workers,
self-observability exporters, and reconnect loops.

Long-lived goroutines must:

- accept a `context.Context` or explicit stop channel;
- stop during graceful shutdown before dependency clients are closed;
- recover panics at the goroutine boundary and log a structured `error`;
- never write to closed NATS or SurrealDB clients after shutdown begins;
- avoid unbounded channels and unbounded retry loops without sleep/backoff;
- stop owned timers and tickers;
- expose enough test hooks to prove cancellation without sleeping for real
  production intervals.

Shutdown order is part of the contract:

1. Mark readiness false.
2. Stop accepting new public requests or private messages where the transport
   supports it.
3. Cancel live subscription, heartbeat, reconnect, worker, and exporter loops.
4. Drain NATS with a bounded timeout.
5. Close SurrealDB clients with a bounded timeout.
6. Flush self-observability best-effort without turning shutdown failures into
   bridge-unavailable noise.

Shutdown must be idempotent. Calling close/drain/stop more than once must not
panic.

## Error Mapping And Observability

The BFF must distinguish transport unavailability from response validation
failure. A decoded response that does not match the expected contract is not a
NATS transport outage. It must be logged as a contract/validation failure and
mapped to the most specific existing error code. If the existing taxonomy cannot
represent bridge response contract drift without pretending the bridge is down,
the error taxonomy must be updated before implementation.

Bridge response validation logs may include Zod issue codes and paths, but not
raw response payloads. The public GraphQL error must not expose internal schema
paths unless the error taxonomy explicitly allows that detail.

Malformed private requests received by Go services must return bridge error
responses in the AsyncAPI envelope shape for that subject after the handler has
decoded enough of the request to identify the subject envelope. If envelope
decoding fails before the subject is known, the handler must NAK or reject the
message according to the adapter contract and emit a structured `ERR-010`
validation log. Handlers must never return a success envelope with omitted
required fields as a fallback for marshalling or validation failures.

Go services must log dependency state transitions and recovered panics using
bounded messages. Logs must include service, event, request_id when known,
operation_or_subject when known, error_id, error_code, and retryable state. Logs
must not include raw NATS payloads, raw SurrealQL, SurrealDB credentials, bearer
tokens, session cookies, provider secrets, or arbitrary request bodies.

Self-observability exporter failures remain isolated from request handling,
readiness, and shutdown. Exporter shutdown flushes are best-effort.

Deep database adapter tracing is a diagnostics feature, not a dependency.
Unsupported adapter tracing must no-op. Failed span creation, exporter
backpressure, exporter outage, invalid incoming trace context, or disabled
trace export must never change adapter return values, readiness state, retry
classification, JetStream ack/NAK decisions, request/reply responses, or
shutdown order. Database adapter tracing must use bounded operation labels and
sanitized CloudGrid error mapping only; raw SQL, SurrealQL, query parameters,
response documents, provider error strings, credentials, tenant IDs, company
IDs, project IDs, and secret-store payloads must not be logged or exported.

## Test And Verification Requirements

Default unit tests must not require Docker, NATS, or SurrealDB. They must cover:

- panic recovery wrappers for request/reply callbacks and worker goroutines;
- NATS error classification and backoff decisions;
- SurrealDB error classification and reconnect state transitions using fakes;
- bounded concurrency, queue saturation, timer cleanup, and log-rate limiting;
- BFF NATS error classification for timeout, no responders, closed connection,
  malformed response envelope, invalid response data, subscription iterator
  failure, and stop-cleanup failure;
- BFF event-loop protection for oversized request bodies, large validation
  issue lists, and subscription queue saturation;
- SurrealDB readiness lock contention or slow-readiness behavior using fakes;
- deep database adapter tracing disabled-by-default behavior, deployed-mode
  configuration rejection, unsupported-adapter no-op behavior, parent-context
  propagation for supported regular adapters, and redaction of raw query text,
  parameters, responses, provider errors, credentials, and secret-store
  operations;
- shutdown idempotency and ordering for every service composition root;
- readiness state transitions from ready to degraded to ready;
- response validation failures mapped separately from transport failures;
- graceful shutdown cancels heartbeat, worker, reconnect, and exporter loops.

`bun run integration:local` must include local-stack scenarios that:

- start every service, verify `/livez` and `/readyz`;
- stop NATS, prove services degrade readiness without process exit, restart
  NATS, and prove readiness recovers and request/reply works again;
- stop SurrealDB, prove storage/control-plane services degrade readiness and
  return retryable storage errors without process exit, restart SurrealDB, and
  prove readiness and requests recover;
- force storage-write JetStream fetch and persistence failures and verify
  retry/ack behavior;
- ingest the same command twice after a forced uncertain storage-write outcome
  and verify idempotency prevents duplicates;
- send malformed request/reply messages directly to private subjects only in
  test scenarios and verify canonical error replies without process exit;
- simulate handler panic through test-only fakes and verify recovery logs.

Integration chaos scenarios must run in a separate opt-in job until they are
stable enough for default CI. The opt-in flag is:

```sh
CLOUDGRID_ENABLE_RESILIENCE_CHAOS_TESTS=true
```

Root/default verification commands must not require this flag.

Chaos scenarios can be promoted from opt-in to required only after they pass in
five consecutive CI runs without timing flakes and have explicit maximum
duration bounds. Promotion must update this spec and the integration suite spec
in the same change.

## Implementation Non-Goals

- Do not add a new queue, database, circuit-breaker service, service mesh, or
  public health aggregator.
- Do not make one service readiness depend on another CloudGrid service
  readiness.
- Do not add BFF-side telemetry fallback, caching, aggregation, or direct
  SurrealDB access.
- Do not change message subjects, GraphQL fields, or error codes without the
  matching contract/spec update and `bun run contracts:check`.
