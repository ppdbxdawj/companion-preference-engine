# T10 Authenticated Loopback API Design

## Decision

Expose the existing local runtime through an authenticated HTTP API bound only to
`127.0.0.1`. The runtime is the sole server; Inspector, Codex, AIRI, and future
hosts are clients. The caller explicitly injects the bearer token when creating
the server or client. Core runtime code does not read environment variables, and
clients do not store credentials in local storage.

## Server boundary

```text
Host / Inspector / Adapter
  → baseUrl + Bearer token
  → 127.0.0.1:<explicit port>
  → authenticated runtime API
  → RuntimeLifecycleCoordinator
```

The server receives the coordinator, not a raw repository. This ensures reset
uses the lifecycle admission gate and no HTTP route can bypass locking, reset,
or application governance. Starting the socket is explicit and returns an
idempotent stop handle; constructing the runtime or HTTP app never listens. The
bind address is always IPv4 loopback; external or LAN binding is not part of
T10.

## Route behavior

Read routes return health, candidates, preferences, effective profile, connection
settings, content-free audit, or export data. Executable mutation routes submit
evidence, candidate/preference actions, connection changes, projection status,
and deletion. Every executable non-reset mutation requires a stable `actionId`
and preserves repository replay/conflict semantics. `/v1/policy-decisions`
remains wire-compatible but returns a content-free `503 runtime-maintenance`
without writing until the application/repository provides an atomic action
receipt for it. Reset requires an exact confirmation phrase and delegates to
the coordinator. Reset is a typed, explicitly user-initiated destructive action;
its success result contains only `{ status: 'reset' }`.

## Failure and privacy behavior

`401` means missing/invalid token. `403` means an unapproved browser Origin.
`400` means invalid strict input. `409` maps an action/revision conflict.
`503` maps maintenance or closed runtime admission. Health contains no user
profile or evidence data. Responses and typed client errors never log private
response bodies. CORS is browser protection only: every process holding the
local bearer token is trusted in T10.

## Client boundary

`RuntimeClient` accepts explicit `{ baseUrl, token, fetch? }`, uses one typed
method per route, validates responses, passes action IDs/revisions, and supports
conditional read polling. It has no persistent credential store and cannot
directly access SQLite.

## Verification and routing

High tier (`gpt-5.6-sol`, high) freezes exact HTTP dependency versions, the local
threat model, auth/CORS/reset/replay tests, server implementation, and release
gate. Low tier (`gpt-5.6-luna`, high) implements only the typed client from frozen
routes and DTOs. No real model, external binding, AIRI adapter, or production
credential storage is added in T10.
