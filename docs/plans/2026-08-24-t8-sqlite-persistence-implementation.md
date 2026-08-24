# T8 SQLite Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a durable, local SQLite implementation of `PreferenceRepository` without adding runtime, network, or host-integration behavior.

**Architecture:** `@companion-preference/profile-store-sqlite` implements the existing asynchronous repository port over synchronous `better-sqlite3` transactions. Contract-shaped values are encoded into indexed columns plus JSON payloads, then revalidated at every read boundary. T8 leaves writer process locking to Task 9.

**Tech Stack:** TypeScript, pnpm workspace, `better-sqlite3@13.0.3`, `valibot@1.4.2`, Vitest, existing contracts and preference-core packages.

---

### Task 1: Freeze SQLite persistence acceptance criteria — high tier

**Files:**
- Create: `packages/profile-store-sqlite/src/repository.test.ts`
- Create: `packages/profile-store-sqlite/migrations/0001_initial.sql` only if required as a test fixture
- Reference: `packages/preference-core/src/repository.ts`
- Reference: `packages/preference-core/src/repository*.test.ts`

**Step 1: Write failing contract-adapter tests**

Cover migration idempotency; identity/host/source-ref uniqueness; candidate
idempotency; action receipt replay/conflict; transaction rollback; expired and
stale leases; file reopen; WAL; `secure_delete`; and evidence deletion with a
no-content tombstone. Reuse the repository contract suite wherever its factory
can target SQLite.

**Step 2: Verify the tests fail for the missing package**

Run: `pnpm --filter @companion-preference/profile-store-sqlite test`

Expected: failure caused by the absent SQLite implementation, not an unrelated
workspace failure.

**Step 3: Freeze the oracle**

High tier alone owns the acceptance test semantics. Low tier may execute but
must not edit these tests.

### Task 2: Add constrained SQLite package plumbing — low tier

**Files:**
- Create: `packages/profile-store-sqlite/package.json`
- Create: `packages/profile-store-sqlite/tsconfig.json`
- Create: `packages/profile-store-sqlite/src/database.ts`
- Create: `packages/profile-store-sqlite/src/index.ts`
- Create: `packages/profile-store-sqlite/migrations/0001_initial.sql`

**Step 1: Add the minimal package manifest and migration**

Use only the approved direct dependencies. The migration creates the nine
designated tables and unique/index constraints. `database.ts` opens an
explicitly supplied in-memory or file path, applies migrations idempotently,
sets `foreign_keys = ON`, `secure_delete = ON`, and WAL for file-backed stores.

**Step 2: Run the frozen tests and typecheck**

Run: `pnpm --filter @companion-preference/profile-store-sqlite test`

Expected: tests remain red only for unimplemented repository behavior.

Run: `pnpm --filter @companion-preference/profile-store-sqlite typecheck`

Expected: PASS.

**Step 3: Handoff limits**

Do not implement mutation semantics, network, runtime locks, environment
configuration, commits, or pushes.

### Task 3: Implement transaction-governed repository behavior — high tier

**Files:**
- Create: `packages/profile-store-sqlite/src/repository.ts`
- Modify: `packages/profile-store-sqlite/src/index.ts`
- Modify: `packages/profile-store-sqlite/src/database.ts` only for tested transaction helpers

**Step 1: Implement row codecs and read validation**

Encode contract values deterministically. On every read, parse typed JSON with
the contract schemas; corrupted rows fail closed rather than becoming valid
preference state.

**Step 2: Implement the explicit atomic commands**

Implement every `PreferenceRepository` method. State transitions, content-free
audits, and action receipts occur in one synchronous SQLite transaction. Do not
provide a generic transaction callback and do not cross `await` inside a
transaction body.

**Step 3: Implement privacy-sensitive deletion**

Physically delete evidence payload, create an ID-only tombstone, remove
dependent pending candidates, scrub retained candidate evidence fields, and
preserve or explicitly revoke confirmed preferences according to the command.

**Step 4: Run package acceptance tests**

Run: `pnpm --filter @companion-preference/profile-store-sqlite test`

Expected: PASS.

### Task 4: Independent release gate — high tier

**Files:**
- Review all T8 paths only

**Step 1: Re-run targeted and workspace checks**

Run:

```bash
pnpm --filter @companion-preference/profile-store-sqlite test
pnpm --filter @companion-preference/profile-store-sqlite typecheck
pnpm --filter @companion-preference/profile-store-sqlite build
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: all checks PASS.

**Step 2: Audit boundaries**

Confirm no live model call, HTTP, AIRI dependency, process lock, automatic
database path configuration, or plaintext conversation content in audit rows.

**Step 3: Hold for review**

Do not commit or push automatically. Report the exact diff and verification
results for user review.
