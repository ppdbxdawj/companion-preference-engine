# T9 Local Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run governed preference learning locally and durably with SQLite and a Fake Observer, while preserving policy, crash, deletion, and single-writer guarantees.

**Architecture:** `RuntimeLifecycleCoordinator` owns a canonical SQLite store, one-writer lock, application service, and background processor. The application service stays transport-free; the processor uses leases and settings revisions to make at-least-once processing safe. T9 remains headless and uses only Fake Observer.

**Tech Stack:** TypeScript, pnpm, existing contracts/preference-core/observer/profile-store-sqlite, `proper-lockfile@4.1.2`, Vitest, Node child-process integration tests.

---

### Task 1: Freeze runtime admission and crash oracle — high tier

**Files:**
- Create: `apps/runtime-local/src/application.test.ts`
- Create: `apps/runtime-local/src/processor.test.ts`
- Create: `apps/runtime-local/src/runtime-lock.test.ts`
- Create: `apps/runtime-local/src/runtime-lifecycle.test.ts`
- Reference: `packages/preference-core/src/repository.ts`
- Reference: `packages/profile-store-sqlite/src/repository.ts`

**Step 1: Write failing vertical acceptance tests**

Freeze tests for independent collection/learn/outbound/apply settings, canonical settings revision fences, candidate confirmation, duplicate source references, action replay/conflict, restart after a lease, cancellation/deletion during processing, fake-observer-only admission, and no unconfirmed Guidance.

**Step 2: Freeze lifecycle tests**

Freeze a two-child-process writer-lock oracle. The second process must report `RUNTIME_ALREADY_RUNNING` before SQLite open. Freeze reset maintenance admission: no DB calls during reset, exact database sidecars only, lock retained, and closed failure state.

**Step 3: Verify RED**

Run: `pnpm --filter @companion-preference/runtime-local test`

Expected: failure solely because runtime-local is not implemented.

**Step 4: Handoff**

Record exact public method signatures, reason codes, settings transition table, crash matrix, and no-real-model constraint. Low tier cannot modify these oracle tests.

### Task 2: Scaffold runtime package and settings mechanics — low tier

**Files:**
- Create: `apps/runtime-local/package.json`
- Create: `apps/runtime-local/tsconfig.json`
- Create: `apps/runtime-local/src/settings.ts`
- Create: `apps/runtime-local/src/main.ts`

**Step 1: Add only approved package wiring**

Declare explicit workspace dependencies and the high-tier-approved lock dependency. Do not start a server or read environment settings. `main.ts` must remain a testable composition stub.

**Step 2: Implement settings normalization against the frozen tests**

Represent independent collection, outbound, projection, observe, learn, and apply settings. Canonical revision increments monotonically. A stale event snapshot may refresh but never elevate permission.

**Step 3: Verify bounded scope**

Run the settings subset and production typecheck. Expected: settings tests pass; vertical runtime tests remain RED for absent application/processor/lifecycle.

### Task 3: Implement application service and fenced processor — high tier

**Files:**
- Create: `apps/runtime-local/src/application.ts`
- Create: `apps/runtime-local/src/processor.ts`
- Modify: `apps/runtime-local/src/main.ts` only for dependency composition

**Step 1: Implement application methods**

Expose only the methods frozen in Task 9: ingest, candidates, lifecycle commands, active/effective profile, settings, policy/audit/export, and evidence deletion. The application service owns no database open/close, lock, worker loop, HTTP, or reset.

**Step 2: Implement at-least-once processing**

Persist before queueing, claim with a token/version fence, use Fake Observer only, recheck canonical settings before dispatch and completion, pass an AbortSignal, and commit candidates through `completeEvidenceProcessingAtomically`. A crash may repeat observation but must not create a second logical candidate.

**Step 3: Run focused tests**

Run: `pnpm --filter @companion-preference/runtime-local test -- application processor`

Expected: PASS.

### Task 4: Implement writer lock and lifecycle/reset coordinator — high tier

**Files:**
- Create: `apps/runtime-local/src/runtime-lock.ts`
- Create: `apps/runtime-local/src/runtime-lifecycle.ts`
- Create: `apps/runtime-local/src/test-child-process.ts`
- Modify: `apps/runtime-local/src/main.ts` only for lifecycle composition

**Step 1: Implement pre-open canonical-path locking**

Acquire the dedicated runtime lock before opening/migrating SQLite. Canonicalize an existing path through its real parent directory and basename. A live owner fails closed; a stale crashed lock can be reclaimed under the frozen bounded policy.

**Step 2: Implement reset maintenance mode**

Retain the lock, block operations, drain handlers, stop workers, checkpoint WAL, verify each exact deletion target, close/recreate the store graph, and remain closed if recreation fails.

**Step 3: Run lock/lifecycle tests**

Run: `pnpm --filter @companion-preference/runtime-local test -- runtime-lock runtime-lifecycle`

Expected: PASS.

### Task 5: Independent runtime release gate — high tier

**Files:**
- Review T9 files only

**Step 1: Re-run full verification**

Run:

```bash
pnpm --filter @companion-preference/runtime-local test
pnpm --filter @companion-preference/runtime-local typecheck
pnpm --filter @companion-preference/runtime-local build
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: PASS.

**Step 2: Audit boundaries**

Confirm no real model, network, HTTP, AIRI, environment configuration, duplicate writer, raw conversation audit, or out-of-scope persistence owner.

**Step 3: Hold for user review**

Do not commit or push automatically. Report the exact diff and checks.
