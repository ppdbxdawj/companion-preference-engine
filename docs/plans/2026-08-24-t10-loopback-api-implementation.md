# T10 Authenticated Loopback API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the governed local runtime through an authenticated loopback API and a host-neutral typed client.

**Architecture:** A constructible loopback-only server receives `RuntimeLifecycleCoordinator`, authenticates a bearer token before dispatch, validates strict requests, and maps typed lifecycle/repository errors without leaking data. Socket start is explicit and returns an idempotent stop handle; constructing the runtime never listens. `RuntimeClient` is a separate package that accepts explicit configuration and never touches SQLite.

**Tech Stack:** TypeScript, Node 24, Hono with the Node server adapter at a high-tier-frozen secure version, Valibot, Vitest, existing runtime contracts.

---

### Task 1: Freeze API security, route, and dependency oracle — high tier

**Files:**
- Create: `apps/runtime-local/src/server.test.ts`
- Create: `apps/runtime-local/src/auth.test.ts`
- Create: `packages/runtime-client/src/client.test.ts`
- Reference: `apps/runtime-local/src/runtime-lifecycle.ts`

**Step 1: Pin server dependencies after advisory/version review**

High tier verifies the current Hono Node adapter compatibility and advisory status,
then freezes exact package versions, allowed origins, token comparison behavior,
bind address, port, reset phrase, error map, route DTOs, ETag rules, and client
method signatures.

**Step 2: Write failing adversarial server/client tests**

Cover loopback binding, token `401`, Origin `403`, empty health, strict invalid
input `400`, conflict `409`, lifecycle maintenance `503`, action replay, evidence
`202`, reset phrase, ETag/304 reads, no body leakage, and typed client response
validation.

**Step 3: Verify RED**

Run: `pnpm --filter @companion-preference/runtime-local test -- server auth`

Expected: failure only because the server/auth modules and client implementation
do not exist.

### Task 2: Implement typed runtime client — low tier

**Files:**
- Create: `packages/runtime-client/package.json`
- Create: `packages/runtime-client/tsconfig.json`
- Create: `packages/runtime-client/src/index.ts`
- Create: `packages/runtime-client/src/client.ts`

**Step 1: Create constrained package plumbing**

Declare only high-tier-frozen workspace/external dependencies. Do not run a server,
store a token, access SQLite, or modify frozen client tests.

**Step 2: Implement one method per frozen route**

Accept explicit `{ baseUrl, token, fetch? }`, validate all responses, send action
IDs/revisions, process `304`, and throw typed content-free errors. Never log
request/response bodies.

**Step 3: Run frozen client tests and typecheck**

Run: `pnpm --filter @companion-preference/runtime-client test`

Expected: PASS.

### Task 3: Implement authenticated loopback server — high tier

**Files:**
- Create: `apps/runtime-local/src/auth.ts`
- Create: `apps/runtime-local/src/server.ts`
- Modify: `apps/runtime-local/src/main.ts` only to expose server composition
- Modify: `apps/runtime-local/package.json` only for frozen server dependencies

**Step 1: Implement admission before dispatch**

Bind exclusively to loopback, compare bearer tokens safely, enforce explicit
browser origins, reject malformed inputs before runtime work, and map errors
without response-body logging.

**Step 2: Implement frozen routes**

Delegate every operation to `RuntimeLifecycleCoordinator.execute`. Reset delegates
to coordinator reset rather than a repository call. Health remains data-free.
Keep `/v1/policy-decisions` as a content-free `503 runtime-maintenance` no-write
response until an atomic action receipt is available; its stable wire DTO is
reserved for that follow-up. Model reset as a shared typed, explicitly
user-initiated destructive request with the exact confirmation phrase and a
minimal `{ status: 'reset' }` result.

**Step 3: Implement explicit Node lifecycle**

Use the pinned `@hono/node-server` adapter only from an explicit start function.
Force `127.0.0.1`, require an explicit port/token/origin list, close a partially
started server on failure, and return an idempotent asynchronous stop handle. Do
not listen from `createRuntimeLocal` or module initialization.

**Step 4: Run server tests**

Run: `pnpm --filter @companion-preference/runtime-local test -- server auth`

Expected: PASS.

### Task 4: Independent HTTP release gate — high tier

**Files:**
- Review T10 paths only

**Step 1: Run full verification**

```bash
pnpm --filter @companion-preference/runtime-local test
pnpm --filter @companion-preference/runtime-local typecheck
pnpm --filter @companion-preference/runtime-local build
pnpm --filter @companion-preference/runtime-client test
pnpm --filter @companion-preference/runtime-client typecheck
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

**Step 2: Audit boundaries and hold review**

Confirm no public binding, real model, token persistence, raw evidence in logs,
repository bypass, external client trust claim, automatic commit, or push.
