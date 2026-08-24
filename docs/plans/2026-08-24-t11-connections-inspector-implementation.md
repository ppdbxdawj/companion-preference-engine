# T11 Connections Inspector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a truthful Connections Inspector backed by a canonical, identity-scoped runtime connection list.

**Architecture:** Add a read-only list operation through repository, application, HTTP contracts, server, and typed client. A new Vue Inspector package reaches the loopback runtime only through a development proxy that owns the dev token. A separate development launcher reads development configuration and starts the runtime explicitly; core runtime construction remains environment-free. Connection cards use revision-fenced updates and show projection state without overstating host verification.

**Tech Stack:** TypeScript, Node 24, SQLite repository, Valibot, Hono loopback runtime, Vue 3.5, Vue Router 4, Vite 8, Vitest, happy-dom.

---

### Task 1: Freeze connection-list and Inspector truth oracle — high tier

**Files:**
- Modify: `packages/contracts/src/schemas.ts`
- Modify: `packages/contracts/src/schemas.test.ts`
- Modify: `packages/contracts/src/fixtures.ts`
- Modify: `packages/preference-core/src/repository.test.ts`
- Modify: `packages/profile-store-sqlite/src/repository.test.ts`
- Modify: `apps/runtime-local/src/server.test.ts`
- Modify: `packages/runtime-client/src/client.test.ts`
- Create: `apps/inspector/src/pages/ConnectionsPage.test.ts`

**Step 1: Define the read DTO and typed client signature**

Add an identity-scoped `ConnectionListHttpRequest` and an ordered connection
list result. Freeze deterministic ordering and ensure only the connection
settings/projection state needed for the page are returned.

**Step 2: Write failing repository and HTTP/client tests**

Cover empty results, identity isolation, ordering, strict query parsing, token
and error handling, and the typed client method. Verify no request can list a
different identity by omitting or adding fields.

**Step 3: Write failing component truth tests**

Freeze loading, empty, runtime error, and populated cards. Cover separate
observe/learn/apply controls, unavailable proactive display, apply-disable
confirmation, revision conflict refresh, and every projection wording state.
Assert the deterministic label is "Local Fake Observer — no external model
configured", no local-storage access occurs, and no optimistic
verified-clearing label is shown.

**Step 4: Verify RED**

Run the focused repository, server, client, and component tests. Expected:
only missing list/UI implementation failures.

### Task 2: Add canonical list behavior through the runtime — low tier

**Files:**
- Modify: `packages/preference-core/src/repository.ts`
- Modify: `packages/preference-core/src/in-memory-repository.ts`
- Modify: `packages/profile-store-sqlite/src/repository.ts`
- Modify: `apps/runtime-local/src/application.ts`
- Modify: `apps/runtime-local/src/server.ts`
- Modify: `packages/runtime-client/src/client.ts`

**Step 1: Implement list operation from frozen port**

Return only connection records matching the complete frozen identity, sorted by
the frozen stable key. Do not reconstruct a list from audit events and do not
relax existing get-one authorization semantics.

**Step 2: Expose exactly one authenticated read route and client method**

Validate the strict request before runtime execution. Use the existing error
envelope, content-free typed errors, explicit loopback client settings, and no
browser persistence.

**Step 3: Verify focused tests**

Run the high-tier frozen repository, runtime, and client tests. Expected: PASS.

### Task 3: Create Inspector shell and Connections page — low tier

**Files:**
- Create: `apps/inspector/package.json`
- Create: `apps/inspector/tsconfig.json`
- Create: `apps/inspector/vite.config.ts`
- Create: `apps/inspector/index.html`
- Create: `apps/inspector/src/main.ts`
- Create: `apps/inspector/src/App.vue`
- Create: `apps/inspector/src/router.ts`
- Create: `apps/inspector/src/api.ts`
- Create: `apps/inspector/src/styles.css`
- Create: `apps/inspector/src/pages/ConnectionsPage.vue`
- Create: `apps/runtime-local/src/dev.ts`

**Step 1: Add only frozen dependencies and package scripts**

Use Vue, Vue Router, Vite, Vue test utilities, and happy-dom at high-tier
approved versions. Do not add a component library or browser token storage.

**Step 2: Implement the shell and proxy-backed API boundary**

Provide `/connections`, `/pending`, `/profile`, and `/data` routes, with only
Connections implemented in T11. Keep the development token in the Vite proxy
process; the browser calls a same-origin `/api` path and never sees it.

**Step 3: Implement a development-only runtime launcher**

Read development configuration only in the launcher, construct the existing
runtime with the deterministic Fake Observer, explicitly start its loopback
server, and shut it down on process termination. Do not add environment reads
to `createRuntimeLocal`, `startRuntimeLoopbackServer`, contracts, or the typed
client.

**Step 4: Implement non-optimistic connection controls**

Fetch canonical list data, ask for apply-disable confirmation, submit the
revision-fenced setting patch, and refresh on conflict. Render the frozen
projection state text and explicit unavailable proactive state.

**Step 5: Verify component tests**

Run the focused Connections page suite. Expected: PASS.

### Task 4: Independent T11 release gate — high tier

**Files:**
- Review all T11 paths only

**Step 1: Run focused and workspace verification**

Run repository, SQLite, contracts, runtime, runtime-client, and Inspector
tests; all workspace typechecks/builds; and `git diff --check` using Node 24.

**Step 2: Review truth and privacy boundaries**

Confirm the list is canonical and identity-scoped, no hard-coded connection is
shown, controls do not cross-enable policies, apply disable requires
confirmation, projection state wording is truthful, and the browser never
receives or stores the token.

**Step 3: Hold for user review**

Do not commit, push, or open a pull request until the user reviews the T11
diff and release-gate result.
