# T12 Pending and Profile Inspector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users safely review pending preference candidates and manage their confirmed active profile without exposing raw conversation content.

**Architecture:** Extend the existing Inspector's same-origin typed API boundary with candidate and active-profile methods already available in the runtime client. Implement Pending and Profile pages as non-optimistic Vue views that render canonical runtime results and refresh after mutations or conflicts.

**Tech Stack:** TypeScript, Vue 3.5, Vite 8, Vitest/happy-dom, existing contracts and RuntimeClient HTTP API.

---

### Task 1: Freeze T12 UI and mutation truth oracle — high tier

**Files:**
- Create: `apps/inspector/src/components/CandidateCard.test.ts`
- Create: `apps/inspector/src/pages/PendingPage.test.ts`
- Create: `apps/inspector/src/pages/ProfilePage.test.ts`
- Modify: `apps/inspector/src/api.test.ts`
- Modify: `packages/runtime-client/src/client.test.ts` only if a required existing typed API method is absent

**Step 1: Write RED component/page tests**

Freeze privacy-first candidate rendering, all five candidate actions,
non-optimistic state, conflict refresh, visible-only polling, active-profile
grouping, revise/revoke, and content-free errors. Assert no raw evidence text,
token, or browser storage access.

**Step 2: Verify API surface**

Freeze only the existing canonical endpoints required by the pages. If an
endpoint/DTO is missing, stop and report it rather than inventing a UI-side
contract.

**Step 2a: Freeze source-host metadata and explicit profile context**

Add a content-free, deterministic `sourceHostIds` candidate field through the
candidate/proposal contract and persistence path. It contains only non-empty,
unique host IDs and is never reconstructed from raw evidence at render time.
Freeze explicit development host/session/domain configuration for profile reads.

**Step 3: Verify RED**

Run Inspector tests; expected failures are missing T12 components/pages/API
wrappers only.

### Task 2: Implement Pending/Profile API boundary and pages — low tier

**Files:**
- Create: `apps/inspector/src/components/CandidateCard.vue`
- Create: `apps/inspector/src/pages/PendingPage.vue`
- Create: `apps/inspector/src/pages/ProfilePage.vue`
- Modify: `apps/inspector/src/api.ts`
- Modify: `apps/inspector/src/App.vue`

**Step 1: Add typed same-origin wrappers**

Use existing routes/contracts. Keep `credentials: 'omit'`, never add browser
token storage, and surface only typed content-free errors.

**Step 2: Implement CandidateCard and Pending**

Render content-free references; build commands from injected IDs/time; wait for
runtime success before refreshing. Poll only when the document is visible and
clear polling on unmount.

**Step 3: Implement Profile**

Render canonical active preferences grouped by domain/scope. Submit revision
and revoke commands without optimistic state changes; refresh after success or
conflict.

**Step 4: Verify focused Inspector tests/typecheck/build**

Expected: PASS.

### Task 3: Independent T12 release gate — high tier

**Files:**
- Review all T12 paths only

Run Inspector, runtime-client, root test/typecheck/build checks under Node
24.19+, then audit no raw evidence rendering, no browser tokens/storage,
non-optimistic mutation behavior, identity/domain grouping, and visible-only
polling. Hold for user review; do not commit, push, or open a PR.
