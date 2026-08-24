# T9 Local Runtime Design

## Decision

Build a headless, host-neutral local runtime over the existing SQLite repository.
It remains directly callable from tests and future adapters. T9 exposes no HTTP,
user interface, AIRI integration, environment configuration, or real model call.
All processing uses `FakePreferenceObserver`.

## Components

```text
RuntimeLifecycleCoordinator
  ├─ RuntimeLock                 one writer before database open
  ├─ SqlitePreferenceRepository  durable canonical state
  ├─ PreferenceApplication        public governed operations
  └─ EvidenceProcessor            leased, policy-fenced background work
         └─ FakePreferenceObserver
```

`PreferenceApplication` coordinates repository operations but does not own database
lifecycle, a process lock, reset, HTTP, or a worker. The processor claims evidence
through a fenced lease, proposes only through the injected observer, rechecks
canonical settings before dispatch and completion, and commits candidates through
the repository's atomic completion command.

## Policy behavior

Collection, learning, outbound inference, and application are independent.
Collection disabled stores no learning payload. Learning disabled creates no
candidate. Outbound disabled does not invoke a remote observer. Application
disabled returns no effective guidance even for confirmed preferences. T9 uses the
fake observer, so outbound admission is tested without a live network effect.

## Failure and deletion behavior

Evidence is persisted before processing. A crash may reprocess work after lease
expiry, but candidate idempotency prevents two logical candidates. A more
restrictive settings revision cancels or invalidates queued/in-flight work; a late
result is discarded with a content-free audit. Deleting evidence invalidates
related pending work and uses T8's tombstone semantics for confirmed authorization.

`resetAllData` enters maintenance mode, rejects database-backed operations, waits
for in-flight handlers, stops workers, checkpoints WAL, and deletes only the
canonical database file plus explicit SQLite sidecars. The lock stays held through
reset; recreation failure leaves the runtime closed.

## Verification and routing

High tier (`gpt-5.6-sol`, high) owns crash, policy-fence, single-writer, reset,
and release-gate semantics. Low tier (`gpt-5.6-luna`, high) implements only frozen
mechanics. No task may call a real model, expose HTTP, or integrate AIRI. Changes
are held for user review before any commit or push.
