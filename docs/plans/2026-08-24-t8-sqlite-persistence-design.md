# T8 SQLite Persistence Design

## Decision

Implement a host-neutral SQLite adapter for the existing
`PreferenceRepository` port. T8 is an internal persistence capability: it
does not expose a user database setting, start a process, call a model,
provide HTTP, or integrate AIRI. Those boundaries belong to later runtime and
adapter milestones.

## Boundary

```text
PreferenceRepository
  ├─ InMemoryPreferenceRepository   (existing test and terminal path)
  └─ SqlitePreferenceRepository     (T8 durable local state)
```

The SQLite store accepts only already-validated contract values and validates
JSON payloads again when reading. Its public surface is the existing
asynchronous repository port; each underlying `better-sqlite3` mutation is a
synchronous transaction with no `await` in its transaction body.

## Stored state and invariants

The initial migration creates evidence, no-content evidence tombstones,
candidates, candidate suppressions, preferences, connection settings,
mutation receipts, audit events, and schema migrations. Identity fields,
status, preference key, timestamps, revision, source reference, lease state,
and candidate idempotency digest are dedicated indexed columns. Typed payloads
and scopes are stored as JSON and parsed through `@companion-preference/contracts`
on read.

Each user mutation commits its state change, content-free audit event, and
`actionId` receipt together. A replay with the same request hash returns the
stored result; the same action ID with another request hash becomes a typed
conflict. Evidence processing uses a worker/token/lease-version fence, so an
expired or stale worker cannot complete newer or deleted evidence.

## Privacy and deletion

The database enables `secure_delete` and uses WAL for file-backed operation.
Deleting evidence removes live content, creates an ID-only provenance tombstone,
and removes dependent pending candidates. Confirmed preferences remain because
their confirmation is a separate user authorization, unless deletion explicitly
requests dependent revocation. Candidate excerpts referencing deleted evidence
are scrubbed. A later runtime reset will checkpoint the WAL before deleting its
exact configured database files.

This is logical/local SQLite erasure, not a guarantee about backups, snapshots,
or SSD wear-leveling.

## Verification and routing

High tier (`gpt-5.6-sol`, high) freezes migration and transactional acceptance
tests, implements/reviews state-changing repository commands, and independently
runs release checks. Low tier (`gpt-5.6-luna`, high) is restricted to package
scaffolding, migrations, database-opening/pragma plumbing, and row codec work
against those frozen tests. Neither tier may add networking, model calls,
runtime process locks, HTTP, AIRI, or user-facing settings.

No commit or push is part of this design decision; the current Task 7 changes
remain available for user review.
