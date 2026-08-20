# Companion Preference Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** First prove a local-first governed preference loop in a host-neutral reference client, then prove that the same core can project confirmed guidance into AIRI without forking AIRI business code.

**Architecture:** A host-neutral TypeScript core owns schemas, candidate lifecycle, scope resolution, conflicts, privacy projections, and explanations. The earliest gate uses an in-memory repository and fake observer so the product hypothesis can fail cheaply. A later canonical local runtime owns SQLite and exposes a loopback HTTP API; Inspector, AIRI, the reference host, and MCP are clients or adapters and never own independent profile state.

**Tech Stack:** Node.js 24, pnpm 10.33, TypeScript 5.9, Valibot 1.4, Vitest 4.1, better-sqlite3 13, Vue 3.5 + Vite 8, a currently secure tested Hono release, the current stable official MCP server SDK, and AIRI `@proj-airi/server-sdk` 0.11.3. Exact Hono/MCP versions are high-tier preflight decisions in Tasks 10 and 16 and are frozen in `pnpm-lock.yaml` only after advisory and interoperability checks.

---

## Implementation rules

- Work only in `/Users/bytedance/Documents/ChatGPT/Airi/companion-preference-engine`.
- Do not modify `/Users/bytedance/Documents/ChatGPT/Airi/airi` while implementing this plan.
- Keep the AIRI integration in `adapters/airi`; do not copy AIRI business code.
- Follow TDD for every behavior: failing test, minimal implementation, passing test, commit.
- Never let Observer or Adapter code write confirmed preferences directly.
- Separate collection, outbound-inference, and projection/application policy. A permission in one stage never implies permission in another.
- Never forward or log `composedMessage`, system prompts, complete chat history, contexts, or tool traces at the Adapter → runtime boundary. Explicitly typed code/terminal content is denied by default; unclassified chat text requires a separate opt-in and may not use a remote Observer until the host supplies trustworthy source categories.
- Do not claim source-side privacy for a host that broadcasts richer data to an adapter before the adapter can filter it. Record that as a host-protocol limitation.
- Bind the runtime to `127.0.0.1`, require a bearer token, and deny cross-origin requests unless explicitly allowlisted.
- One runtime process is the sole writer for one database.
- Treat all bearer-authenticated local clients as trusted in M1. `allowedHosts` prevents accidental projection; it is not a hostile-client security boundary until host-bound capabilities are designed.
- Every dependency change updates and stages the root `pnpm-lock.yaml` in the same task. The high tier must recheck current advisories, runtime compatibility, and native prebuild support before freezing a version; the low tier may not upgrade or downgrade it.
- Every commit step in this plan is executed by root only after a high-tier `H-verify` PASS. Low-tier agents return a diff and never commit, push, or open a PR.
- Stop after each task if the expected test output does not match; diagnose before continuing.

## Target repository layout

```text
companion-preference-engine/
├── apps/
│   ├── inspector/
│   ├── reference-host/
│   └── runtime-local/
├── adapters/
│   └── airi/
├── evals/
│   ├── datasets/
│   └── src/
├── packages/
│   ├── contracts/
│   ├── observer/
│   ├── preference-core/
│   ├── profile-store-sqlite/
│   └── runtime-client/
├── servers/
│   └── mcp/
└── docs/plans/
```

## Milestone gates and stop points

The tasks below form a roadmap, not one indivisible delivery. Execution stops at every gate for review; a later milestone must not be used to rescue a failed earlier hypothesis.

| Milestone | Tasks | Required proof | Explicitly not blocking this gate |
| --- | --- | --- | --- |
| M0 — core hypothesis | 1–6 | Contracts, deterministic lifecycle/resolver, in-memory repository, fake observer, frozen minimum evaluation set and baseline report | Real model, SQLite, HTTP, UI, AIRI, MCP |
| M1 — usable local slice | 7–14 | Real Observer behind consent, single-writer SQLite runtime, minimal Pending/Profile Inspector, reference-host closed loop, 60-case evaluation, and blinded export | AIRI, MCP, full operational packaging |
| M2 — AIRI feasibility | 15 | Protocol spike passes first; Sidecar proves the same core works in a second host through sanitized Adapter → runtime ingestion and confirmed-guidance projection | Upstream protocol changes, multi-session support |
| M3 — optional interoperability | 16 | MCP reads the canonical runtime and cannot bypass governance | Passive observation through MCP |
| M4 — end-to-end acceptance | 17 | Privacy/restart/reset tests, real host checks, operational docs, and user Go/No-Go review | Identity, Relationship, Reflection, Proactivity, sync, embodiment |

Go/No-Go rules:

- Stop after M0 if the governed representation cannot express the selected work-companion preferences deterministically.
- Stop after M1 if candidate precision, conflict/change handling, deterministic privacy, candidate frequency, or the reference-host closed loop fails Task 14. Two-host reuse is not proven until M2; blind human preference and real-user acceptance remain M4 evidence.
- Do not start the production AIRI adapter until Task 15's protocol spike confirms the exact SDK/runtime semantics against the pinned AIRI revision.
- MCP and UI polish are optional follow-ons; they are not evidence that the core preference hypothesis works.

## Task 1: Bootstrap the TypeScript workspace

**Files:**

- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.node-version`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `README.md`
- Create: package directories shown in the target layout

**Step 1: Verify the required runtime**

Run:

```bash
node --version
corepack pnpm --version
```

Expected: Node `v24.x` or newer and pnpm `10.33.x`. If the shell still reports the current system Node 20, switch to the bundled workspace Node or the user's version manager before installing dependencies.

**Step 2: Create the root workspace manifest**

Create `package.json`:

```json
{
  "name": "companion-preference-engine",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @companion-preference/runtime-local --filter @companion-preference/inspector dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "check": "pnpm typecheck && pnpm test && git diff --check"
  },
  "devDependencies": {
    "@types/node": "24.12.2",
    "@vitest/coverage-v8": "4.1.4",
    "tsdown": "0.21.9",
    "tsx": "4.21.0",
    "typescript": "5.9.3",
    "vite": "8.0.8",
    "vitest": "4.1.4"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - apps/*
  - adapters/*
  - servers/*
  - evals
```

Create `.node-version` containing `24`.

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

**Step 3: Add the root test configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'adapters/**/*.test.ts',
      'servers/**/*.test.ts',
      'evals/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
```

**Step 4: Install and verify the empty workspace**

Run:

```bash
corepack pnpm install
corepack pnpm test --passWithNoTests
```

Expected: dependency installation succeeds and Vitest exits successfully with no tests.

**Step 5: Commit**

```bash
git add .editorconfig .gitignore .node-version package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts README.md
git commit -m "chore: bootstrap preference engine workspace"
```

## Task 2: Define host-neutral contracts and three privacy policy layers

**Files:**

- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/schemas.ts`
- Create: `packages/contracts/src/schemas.test.ts`
- Create: `packages/contracts/src/fixtures.ts`

**Step 1: Add the package manifest and dependency**

Create `packages/contracts/package.json` with package name `@companion-preference/contracts`, scripts `build`, `test`, and `typecheck`, and dependency `valibot@1.4.2`.

**Step 2: Add the first red-green increment for identity and policy**

Write behavioral tests before each schema implementation. First cover:

- stable `userId`, `companionId`, `relationshipId`, `hostId`, `sessionId`, and `domain` are required;
- `CollectionPolicy` controls which typed host sources may be collected and whether content may be retained;
- `OutboundInferencePolicy` independently controls disabled, local-only, or explicitly configured remote inference;
- `ProjectionPolicy` independently lists permitted hosts and domains;
- enabling projection cannot silently enable collection or outbound inference.

Run the focused test and observe a schema-validation failure, implement only these schemas, then rerun to green. Do not use a missing import as the meaningful red state.

**Step 3: Add the evidence increment**

Define `InteractionEvidence` around a strict, host-neutral allowlist:

```ts
interface InteractionEvidence {
  schemaVersion: 1
  id: string
  identity: IdentityContext
  occurredAt: string
  sourceRef: string
  source: {
    kind: 'chat-turn' | 'explicit-form' | 'reference-host-turn'
    contentCategory: 'ordinary-conversation' | 'code' | 'terminal' | 'tool-trace'
  }
  consent: { purpose: 'preference-learning'; policyVersion: string }
  learningPayload: {
    userText: string
    assistantText?: string
  }
  policySnapshot: {
    collection: CollectionPolicy
    outboundInference: OutboundInferencePolicy
    projection: ProjectionPolicy
    settingsRevision: number
  }
}
```

`sourceRef` is unique only within its host namespace. Deduplication uses the canonical composite `(userId, companionId, relationshipId, hostId, sourceRef)`; adapters must not assume unrelated hosts generate globally unique IDs.

Tests must reject unknown keys and host-native structures including `composedMessage`, `contexts`, system prompts, tools, and arbitrary metadata. Code, terminal, and tool-trace categories are rejected unless the connection's collection policy explicitly allows that typed source; this decision must come from trusted adapter metadata or explicit user authorization, never from regex classification of text. `policySnapshot` is audit input, not authority: Runtime loads the canonical Connection Settings, requires the expected revision, and enforces the canonical policy. An event can never raise its own permissions.

Define a separate provenance union so content deletion remains schema-valid:

```ts
type EvidenceProvenance =
  | { state: 'live'; evidence: InteractionEvidence }
  | { state: 'deleted-tombstone'; evidenceId: string; deletedAt: string; reasonCode: string }
```

The tombstone stores no `learningPayload`, source excerpt, or host-native content.

Run the evidence tests red, implement the minimum schema, and run them green.

**Step 4: Add the closed preference and governance increment**

The preference union must be closed and discriminated:

```ts
export type Preference =
  | { key: 'interaction.response_detail', value: 'concise' | 'balanced' | 'detailed' }
  | { key: 'interaction.directness', value: 'gentle' | 'balanced' | 'direct' }
  | { key: 'interaction.initiative', value: 'ask_first' | 'low_risk_auto' | 'proactive' }
  | { key: 'interaction.interruption_policy', value: 'never_interrupt' | 'important_only' | 'allowed' }
  | { key: 'work.approval_style', value: 'always_ask' | 'risk_based' | 'review_after' }
  | { key: 'work.verification_depth', value: 'minimal' | 'targeted' | 'exhaustive' }
  | { key: 'companion.support_style', value: 'listen_first' | 'acknowledge_then_act' | 'direct_action' }
```

Add schemas for `PreferenceScope`, `PreferenceCandidate`, `PreferenceRecord`, `EffectiveProfileQuery`, `BehaviorGuidance`, `ConnectionSettings`, `AdapterProjectionStatus`, `McpPrincipal`/capability, external proposal provenance, content-free policy decisions, mutation receipts, HTTP request/response DTOs, and audit events. Every non-reset user mutation carries a stable `actionId`. Full reset deliberately deletes receipts with all other data and is a no-op when replayed against an already empty store.

Keep lifecycle types separate:

```ts
type CandidateStatus = 'pending_confirmation' | 'confirmed' | 'rejected' | 'superseded' | 'deleted'
type PreferenceStatus = 'active' | 'superseded' | 'revoked' | 'deleted'
```

Define typed commands for external pending-only proposal, candidate deletion, preference revision/supersession, settings changes, and projection-status reporting. Candidate identity includes a stable idempotency key derived from normalized evidence/proposal provenance + preference key/value + scope; confidence is evidence, never authority.

Write the failing tests first, including rejection of free-form keys and already-confirmed Observer output, then implement and rerun.

**Step 5: Run the package checks**

```bash
corepack pnpm --filter @companion-preference/contracts test
corepack pnpm --filter @companion-preference/contracts typecheck
```

Expected: all behavioral schema tests PASS.

**Step 6: Commit**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat: define preference engine contracts"
```

## Task 3: Implement the governed candidate lifecycle

**Files:**

- Create: `packages/preference-core/package.json`
- Create: `packages/preference-core/tsconfig.json`
- Create: `packages/preference-core/src/index.ts`
- Create: `packages/preference-core/src/lifecycle.ts`
- Create: `packages/preference-core/src/lifecycle.test.ts`

**Step 1: Write failing lifecycle tests**

Cover these cases:

- pending candidate can be confirmed;
- pending candidate can be rejected;
- confirmed preference can be revoked;
- rejected candidate cannot be confirmed later without a new candidate;
- transition is idempotent when the same action ID is replayed;
- Observer cannot create an already-confirmed record.

Representative test:

```ts
it('requires an explicit user action before activation', () => {
  const result = applyCandidateAction(pendingCandidate, {
    id: 'action-1',
    type: 'confirm',
    actor: 'user',
    occurredAt: now,
  })

  expect(result.candidate.status).toBe('confirmed')
  expect(result.preference?.authority).toBe('user-confirmed')
})
```

**Step 2: Run the failing test**

```bash
corepack pnpm --filter @companion-preference/preference-core test -- lifecycle
```

Expected: FAIL because lifecycle functions do not exist.

**Step 3: Implement pure transition functions**

Implement:

```ts
applyCandidateAction(candidate, action)
revokePreference(preference, action)
supersedePreference(previous, replacement, action)
```

Each function returns new immutable objects plus an audit event. Illegal transitions throw a typed `InvalidTransitionError`. No storage, time lookup, random ID generation, or host code belongs in this module.

**Step 4: Run tests**

```bash
corepack pnpm --filter @companion-preference/preference-core test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/preference-core pnpm-lock.yaml
git commit -m "feat: govern preference candidate lifecycle"
```

## Task 4: Implement scope, privacy, conflict, and explanation resolution

**Files:**

- Create: `packages/preference-core/src/resolver.ts`
- Create: `packages/preference-core/src/resolver.test.ts`
- Create: `packages/preference-core/src/explain.ts`
- Create: `packages/preference-core/src/explain.test.ts`
- Modify: `packages/preference-core/src/index.ts`

**Step 1: Write a table-driven failing resolver test**

Test the precedence chain:

```text
task > workspace > host > domain > global
```

Also test:

- manually-set beats user-confirmed inference at equal specificity;
- a global inferred record is excluded;
- a host outside `allowedHosts` cannot see the record;
- a domain outside `allowedDomains` cannot see the record;
- unresolved equal-priority conflicts produce no applied value;
- revoked and superseded records are excluded;
- output includes applied record IDs and conflict explanations.

Representative test:

```ts
it('does not leak a companion preference into work', () => {
  const result = resolveEffectiveProfile([companionOnlyPreference], {
    userId: 'user-local',
    companionId: 'companion-airi',
    relationshipId: 'relationship-1',
    hostId: 'codex',
    domain: 'work',
  })

  expect(result.guidance).toEqual({})
  expect(result.excluded[0]?.reason).toBe('privacy-scope-mismatch')
})
```

**Step 2: Verify failure**

```bash
corepack pnpm --filter @companion-preference/preference-core test -- resolver
```

Expected: FAIL because resolver functions do not exist.

**Step 3: Implement the minimal deterministic resolver**

Implement pure helpers:

```ts
matchesIdentity(record, query)
matchesPrivacy(record, query)
matchesScope(record, query)
scopeSpecificity(scope)
authorityPriority(authority)
resolveEffectiveProfile(records, query)
explainResolution(result)
```

Never use the current date implicitly; pass `now` into the query for expiration checks.

**Step 4: Run all lifecycle and resolver tests**

```bash
corepack pnpm --filter @companion-preference/preference-core test
```

Expected: all lifecycle and resolver tests PASS.

**Step 5: Commit**

```bash
git add packages/preference-core
git commit -m "feat: resolve scoped and private preferences"
```

## Task 5: Define repository ports and an in-memory test repository

**Files:**

- Create: `packages/preference-core/src/repository.ts`
- Create: `packages/preference-core/src/repository.test.ts`
- Create: `packages/preference-core/src/in-memory-repository.ts`
- Modify: `packages/preference-core/src/index.ts`

**Step 1: Write failing repository contract tests**

Define one reusable contract suite that verifies any repository implementation:

- `ingestEvidenceAtomically` deduplicates by the canonical identity/host/`sourceRef` composite and records its no-content audit event in the same commit;
- `claimNextEvidence` leases the oldest available item with an unguessable claim token and monotonic lease version;
- an expired claim can be recovered, while an active claim cannot be stolen;
- a stale worker cannot renew, release, or complete a newer claim;
- `completeEvidenceProcessingAtomically` inserts candidates and marks evidence complete in one commit;
- replaying the same completion does not duplicate candidates because candidate idempotency keys are unique;
- explicit creation, confirmation, supersession, and revocation enforce preference revision monotonicity;
- `listActivePreferences` excludes revoked/deleted rows;
- `confirmCandidateAtomically` persists candidate transition, preference, and audit event together or persists none;
- external proposal, candidate delete/suppression, explicit creation, revision/supersession, and revocation each persist state plus audit in one command;
- every non-reset mutation receipt survives restart: same action ID + same payload returns the stored result, while same action ID + different payload is a conflict;
- deleting evidence removes pending candidates supported only by that evidence, but does not silently revoke a user-confirmed preference.

**Step 2: Define the port**

```ts
export interface PreferenceRepository {
  ingestEvidenceAtomically(evidence: InteractionEvidence): Promise<'inserted' | 'duplicate'>
  claimNextEvidence(workerId: string, leaseUntil: string): Promise<EvidenceClaim | undefined>
  renewEvidenceClaim(claim: EvidenceClaimRef, leaseUntil: string): Promise<void>
  releaseEvidenceClaim(claim: EvidenceClaimRef): Promise<void>
  completeEvidenceProcessingAtomically(command: CompleteEvidenceProcessing): Promise<void>
  getEvidenceProvenance(id: string): Promise<EvidenceProvenance | undefined>
  listEvidenceProvenance(identity: IdentityContext): Promise<EvidenceProvenance[]>
  proposeCandidateAtomically(command: ProposeCandidateCommand): Promise<PreferenceCandidate>
  getCandidate(id: string): Promise<PreferenceCandidate | undefined>
  listCandidates(status?: CandidateStatus): Promise<PreferenceCandidate[]>
  confirmCandidateAtomically(command: ConfirmCandidateCommand): Promise<PreferenceRecord>
  rejectCandidateAtomically(command: RejectCandidateCommand): Promise<void>
  deleteCandidateAtomically(command: DeleteCandidateCommand): Promise<void>
  suppressCandidateAtomically(command: SuppressCandidateCommand): Promise<void>
  listCandidateSuppressions(identity: IdentityContext): Promise<CandidateSuppression[]>
  createExplicitPreferenceAtomically(command: CreateExplicitPreferenceCommand): Promise<PreferenceRecord>
  revisePreferenceAtomically(command: RevisePreferenceCommand): Promise<PreferenceRecord>
  revokePreferenceAtomically(command: RevokePreferenceCommand): Promise<PreferenceRecord>
  getPreference(id: string): Promise<PreferenceRecord | undefined>
  listActivePreferences(identity: IdentityContext): Promise<PreferenceRecord[]>
  getConnectionSettings(hostId: string): Promise<ConnectionSettings>
  updateConnectionSettingsAtomically(command: UpdateConnectionSettingsCommand): Promise<ConnectionSettings>
  reportAdapterProjectionStatusAtomically(command: ReportProjectionStatusCommand): Promise<AdapterProjectionStatus>
  recordPolicyDecisionAtomically(decision: ContentFreePolicyDecision): Promise<void>
  listAuditEvents(query: AuditQuery): Promise<AuditEvent[]>
  deleteEvidenceAtomically(command: DeleteEvidenceCommand): Promise<DeleteEvidenceResult>
}
```

`EvidenceClaim` contains `{ evidence, workerId, claimToken, leaseVersion, leaseUntil }`. Renew, release, and completion compare worker, token, version, and non-deleted state; an obsolete or deleted claim returns `STALE_CLAIM`. Do not expose raw save/append methods or a generic asynchronous transaction callback. `better-sqlite3` transactions are synchronous; the explicit atomic commands above are the cross-implementation contract and contain no `await` inside their SQLite transaction body.

**Step 3: Implement `InMemoryPreferenceRepository`**

Use immutable clones at boundaries so tests cannot mutate stored state through references. Add per-step failure injection to every atomic command so state, audit, and mutation receipt are proven all-or-nothing. Enforce the same candidate idempotency keys and unique action receipts that SQLite will enforce later. Confirmation, explicit creation, and revision must atomically supersede any active preference occupying the same identity/key/scope slot.

**Step 4: Run tests**

```bash
corepack pnpm --filter @companion-preference/preference-core test -- repository
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/preference-core
git commit -m "feat: add preference repository port"
```

## Task 6: Freeze the minimum evaluation set and add a fake Observer

**Files:**

- Create: `packages/observer/package.json`
- Create: `packages/observer/tsconfig.json`
- Create: `packages/observer/src/index.ts`
- Create: `packages/observer/src/observer.ts`
- Create: `packages/observer/src/fake-observer.ts`
- Create: `packages/observer/src/fake-observer.test.ts`
- Create: `evals/package.json`
- Create: `evals/tsconfig.json`
- Create: `evals/datasets/work-core-v1.jsonl`
- Create: `evals/datasets/cross-domain-core-v1.jsonl`
- Create: `evals/datasets/held-out-input-core-v1.jsonl`
- Create: `evals/datasets/manifest-v1.json`
- Create: `evals/src/schema.ts`
- Create: `evals/src/load.ts`
- Create: `evals/src/load.test.ts`
- Create: `evals/src/baselines/no-personalization.ts`
- Create: `evals/src/baselines/plain-memory.ts`
- Create: `evals/src/baselines/semantic-memory-rag.ts`
- Create: `evals/src/baselines/manual-profile.ts`
- Create: `evals/src/candidate-eval.ts`
- Create: `evals/src/candidate-eval.test.ts`
- Create: `evals/reports/m0-baseline.md`

**Step 1: Define the Observer port and deterministic fake**

```ts
export interface PreferenceObserver {
  propose(input: ObserverInput, signal?: AbortSignal): Promise<ObserverProposal[]>
}
```

Write failing tests proving `FakePreferenceObserver` returns only caller-supplied pending proposals, respects abort signals, and never performs network I/O. Implement only the port and fake; real prompt or model code is forbidden in this task.

**Step 2: Freeze the dataset schema before prompt implementation**

Each development JSONL case contains a stable ID, category, consent-safe synthetic turns, expected candidates, forbidden keys, query context, and expected guidance. Start with at least 24 reviewed development cases and a separately pre-registered held-out input set owned by the high tier:

- 6 explicit or repeated work preferences;
- 4 temporary states that must not become preferences;
- 4 conflicts or changes;
- 4 ambiguous abstention cases;
- 6 cross-domain counterfactual pairs.

Do not copy the user's private conversation history. The repository may contain consent-safe held-out inputs, but held-out labels live outside the shared workspace in a high-tier-only evaluation input that is never delegated to the low tier. `manifest-v1.json` records counts plus SHA-256 hashes for development data, held-out inputs, and the externally held labels. The Task 7 prompt implementer receives development data only; the high tier runs held-out scoring. Once frozen, label edits require a new manifest version and a reviewed explanation of why the gold label was wrong; they may not be changed merely to improve the current prompt's score.

**Step 3: Write loader and metric tests red, then green**

Report precision, recall, abstention accuracy, conflict/change accuracy, deterministic cross-domain leakage count, and candidates per 20 turns. The deterministic resolver must produce zero cross-domain leakage. Candidate extraction thresholds become binding in Task 14 after a real model is configured.

**Step 4: Implement four pre-prompt baselines**

- No personalization: produces no candidates or guidance.
- Plain memory: unconstrained fact extraction plus lexical retrieval, without confirmation governance.
- Strong semantic Memory/RAG: same backbone model, consented window, retrieval budget, and generation budget as the Preference Engine, but without governed candidate state.
- Manual profile: the gold user-authored profile as an approximate upper bound.

The baseline interfaces are frozen here so the later Observer cannot redefine its comparison. Generate `evals/reports/m0-baseline.md` from deterministic fixtures and record known limitations rather than claiming behavioral superiority.

**Step 5: Run the M0 gate**

```bash
corepack pnpm --filter @companion-preference/observer test
corepack pnpm --filter @companion-preference/evals test
corepack pnpm --filter @companion-preference/preference-core test
corepack pnpm --filter @companion-preference/contracts test
corepack pnpm --filter @companion-preference/contracts typecheck
```

Expected: contracts, lifecycle, resolution, repository, fake Observer, dataset loader, and deterministic privacy checks PASS. Stop for review before any real Observer prompt is written.

**Step 6: Commit the frozen inputs**

```bash
git add packages/observer evals pnpm-lock.yaml
git commit -m "test: freeze minimum preference evaluation set"
```

## Task 7: Add the safe OpenAI-compatible Observer adapter

**Files:**

- Create: `packages/observer/src/openai-compatible.ts`
- Create: `packages/observer/src/openai-compatible.test.ts`
- Create: `packages/observer/src/prompt.ts`
- Create: `packages/observer/src/prompt.test.ts`

**Step 1: Write failing safety and outbound-policy tests**

Test that the serialized request:

- contains only the current approved evidence window;
- excludes `composedMessage`, system messages, tool traces, code, and terminal content;
- is never sent when outbound inference is disabled;
- is accepted by a remote endpoint only when `allow-configured-remote` was explicitly selected for that typed source;
- in `local-only` mode accepts only literal loopback addresses in `127.0.0.0/8` or `::1` (or a separately implemented controlled Unix socket), rejects DNS hostnames including `localhost`, and rejects every redirect;
- in remote mode revalidates policy for the final destination and never follows a redirect implicitly;
- an aborted or newly revoked dispatch performs no new network write, and an in-flight fetch receives the caller's `AbortSignal`;
- includes the allowed schema keys and a mandatory abstain path;
- treats malformed or out-of-schema output as zero proposals;
- never emits `confirmed` status;
- redacts common secret patterns before network transmission.

**Step 2: Verify failure**

```bash
corepack pnpm --filter @companion-preference/observer test
```

Expected: FAIL.

**Step 3: Implement `OpenAICompatiblePreferenceObserver`**

Use `fetch` against a user-supplied OpenAI-compatible `baseUrl`, `model`, and optional API key. Set `redirect: 'manual'`; the first slice rejects redirects instead of trying to validate a redirect chain. Parse IP literals without DNS resolution, including bracketed IPv6, and apply the outbound policy before opening a connection. Read configuration only from environment variables in the first milestone:

```text
COMPANION_LLM_BASE_URL
COMPANION_LLM_MODEL
COMPANION_LLM_API_KEY
```

Parse the response with Valibot. Set a request timeout, propagate `AbortSignal`, and return `[]` on parse failure; throw only transport/configuration errors that the runtime can audit. The Observer never decides whether a stale result may commit; Runtime performs that final revision fence in Task 9.

The runtime and all integration tests continue to use `FakePreferenceObserver`; no automated test may call a real model.

**Step 4: Run tests**

```bash
corepack pnpm --filter @companion-preference/observer test
```

Expected: PASS with all network calls mocked.

**Step 5: Commit**

```bash
git add packages/observer
git commit -m "feat: propose preferences through a safe observer"
```

## Task 8: Add SQLite persistence and explicit atomic commands

**Files:**

- Create: `packages/profile-store-sqlite/package.json`
- Create: `packages/profile-store-sqlite/tsconfig.json`
- Create: `packages/profile-store-sqlite/src/index.ts`
- Create: `packages/profile-store-sqlite/src/database.ts`
- Create: `packages/profile-store-sqlite/src/repository.ts`
- Create: `packages/profile-store-sqlite/src/repository.test.ts`
- Create: `packages/profile-store-sqlite/migrations/0001_initial.sql`

**Step 1: Add dependencies**

Use `better-sqlite3@13.0.3` and `valibot@1.4.2`. Add the matching `@types/better-sqlite3` development dependency if needed.

**Step 2: Run the shared repository contract against SQLite**

Run the Task 5 contract suite against `new Database(':memory:')`. Add failing tests for:

- idempotent migration;
- unique `(user_id, companion_id, relationship_id, host_id, source_ref)` and candidate idempotency key;
- unique mutation `action_id`, replay result, and payload hash;
- all-or-nothing explicit atomic commands under injected failures;
- recoverable expired evidence leases;
- stale claim completion rejected after re-lease or evidence deletion;
- file reopen preserving confirmed preferences;
- WAL mode for file-backed tests;
- `PRAGMA secure_delete = ON` for ordinary row deletion and an explicit WAL checkpoint path before destructive reset.

The profile store does not own the process lock. Runtime startup acquires it in Task 9 before opening the database or running migrations.

**Step 3: Implement the schema and repository**

Create `evidence`, `evidence_tombstones`, `candidates`, `candidate_suppressions`, `preferences`, `connection_settings`, `mutation_receipts`, `audit_events`, and `schema_migrations`. Store typed payloads/scopes as JSON, but keep identity, status, preference key, timestamps, revisions, processing owner/token/version/lease, candidate idempotency key, and `source_ref` as indexed columns. Parse every JSON value with the contracts package when reading.

Implement evidence completion, confirmation/rejection, explicit preference creation, revocation, suppression, and deletion as synchronous `better-sqlite3` transactions hidden behind the asynchronous repository port. Every non-reset user mutation writes a unique `actionId`, canonical request hash, and non-sensitive result summary in the same transaction. Replaying the same ID and payload returns the prior result; changing the payload returns a typed conflict that HTTP maps to 409. No transaction body may cross an `await`.

Evidence deletion physically removes the live payload under `secure_delete`, creates the no-content provenance tombstone, deletes dependent pending candidates, and scrubs evidence/counter-evidence excerpts from rejected, superseded, confirmed, or otherwise retained candidate rows. Preference records retain only the tombstoned evidence ID unless dependent revocation was explicitly requested. Document the limit: logical/SQLite erasure cannot promise removal from filesystem snapshots, backups, or SSD wear-leveling.

**Step 4: Run package tests**

```bash
corepack pnpm --filter @companion-preference/profile-store-sqlite test
```

Expected: shared contract and SQLite-specific tests PASS.

**Step 5: Commit**

```bash
git add packages/profile-store-sqlite pnpm-lock.yaml
git commit -m "feat: persist governed preferences in sqlite"
```

## Task 9: Build the runtime application service and durable processing loop

**Files:**

- Create: `apps/runtime-local/package.json`
- Create: `apps/runtime-local/tsconfig.json`
- Create: `apps/runtime-local/src/application.ts`
- Create: `apps/runtime-local/src/application.test.ts`
- Create: `apps/runtime-local/src/processor.ts`
- Create: `apps/runtime-local/src/processor.test.ts`
- Create: `apps/runtime-local/src/settings.ts`
- Create: `apps/runtime-local/src/settings.test.ts`
- Create: `apps/runtime-local/src/runtime-lock.ts`
- Create: `apps/runtime-local/src/runtime-lock.test.ts`
- Create: `apps/runtime-local/src/runtime-lifecycle.ts`
- Create: `apps/runtime-local/src/runtime-lifecycle.test.ts`
- Create: `apps/runtime-local/src/main.ts`
- Create: `apps/runtime-local/src/test-child-process.ts`

**Step 1: Write failing vertical service tests**

Write tests for these exact semantics:

```text
collection disabled → discard learningPayload and record only a no-content decision audit
collection enabled + learn disabled → discard learningPayload and create no candidate
outbound inference disabled → never invoke a remote Observer
learn enabled → persist evidence, propose candidate asynchronously
confirm → candidate and preference update atomically
apply disabled → effective profile is empty
reject → no preference record
restart → leased/unprocessed evidence resumes at least once but yields one logical candidate
duplicate sourceRef → no duplicate candidate
suppress similar → matching future proposal is not created
mutation response lost → restart + same actionId/payload returns the original result without duplicate audit
same actionId + different payload → typed conflict
delete evidence → remove pending candidates supported only by it; retain confirmed user-authorized preference with tombstoned provenance
delete evidence with revokeDependentPreference → also revoke the confirmed record
```

Representative test:

```ts
it('does not apply an inferred preference before confirmation', async () => {
  await app.ingestEvidence(turnEvidence)
  await processor.drain()

  const before = await app.getEffectiveProfile(workQuery)
  expect(before.guidance).toEqual({})

  const [candidate] = await app.listPendingCandidates()
  await app.confirmCandidate(candidate!.id, confirmCommand)

  const after = await app.getEffectiveProfile(workQuery)
  expect(after.guidance.approvalStyle).toBe('review_after')
})
```

**Step 2: Verify failure**

```bash
corepack pnpm --filter @companion-preference/runtime-local test -- application
```

Expected: FAIL.

**Step 3: Implement the application service**

Expose methods:

```ts
ingestEvidence
proposeCandidate
listPendingCandidates
confirmCandidate
rejectCandidate
deleteCandidate
suppressCandidate
createExplicitPreference
revisePreference
revokePreference
getEffectiveProfile
listActivePreferences
getConnectionSettings
updateConnectionSettings
reportAdapterProjectionStatus
recordPolicyDecision
listAuditEvents
exportData
deleteEvidence
```

Connection settings contain independent `collectionPolicy`, `outboundInferencePolicy`, and `projectionPolicy`, plus `observeEnabled`, `learnEnabled`, `applyEnabled`, a monotonic settings revision, and adapter projection state (`lastGuidanceHash`, `lastAttemptAt`, `state`, `detailCode`). On ingest, Runtime compares the event's policy snapshot revision with these canonical settings and always enforces the canonical version; a stale snapshot must refresh rather than elevate permissions. The application service coordinates repository ports but contains no HTTP, AIRI, database lifecycle, process-lock, or full-reset code.

**Step 4: Implement an idempotent, at-least-once processor**

Persist evidence before enqueueing. Claim work with an unguessable fencing token and monotonic lease version, renew only with the current fence, and process one identity stream serially. Carry the canonical settings revision on the claim. Recheck collection/learn/outbound policy immediately before dispatch, pass an `AbortSignal`, cancel queued/in-flight work when a stricter settings revision is committed, then recheck the revision and policy inside atomic completion. A revoked or late result is discarded and audited without content.

Derive the candidate idempotency key from normalized evidence ID + preference + scope. Commit all proposed candidates and evidence completion through `completeEvidenceProcessingAtomically`; it validates the current worker/token/version, settings fence, and non-deleted evidence in the transaction. Never perform `save candidate → await → mark processed` as separate operations.

Add failure-injection tests for crashes:

- after claim but before Observer call;
- after Observer returns but before atomic completion;
- during the atomic completion transaction;
- after commit but before the worker acknowledges completion.
- after a lease expires and a new worker claims it, followed by the old worker's late completion;
- while the Observer runs, followed by user deletion of the evidence before completion.

Recovery may re-run the Observer, but it must never create two logical candidates. Cap retries and audit permanent failures without storing rejected raw payloads in logs.

**Step 5: Enforce one runtime writer before database open**

Add `proper-lockfile@4.1.2` (and types if required). Canonicalize the configured database path as `realpath(parentDirectory) + basename`, create a dedicated `<canonical-db-path>.runtime` lock target, and acquire its process lease before opening SQLite or running migrations. Use a bounded stale timeout with periodic lock updates, no silent retry when a live owner exists, release on graceful shutdown and startup failure, and document that a genuinely crashed stale lease may be reclaimed.

Launch two actual child processes in an integration test. The first must acquire the canonical-path lease; the second must exit with a clear `RUNTIME_ALREADY_RUNNING` error before touching the database. Verify an expired/crashed lease can subsequently be acquired.

**Step 6: Implement deletion and reset semantics**

- Regular audit history is append-only and stores IDs/reason codes, never raw conversation text.
- Deleting evidence removes its content and dependent pending candidates. A confirmed preference remains because confirmation is a separate user authorization; its provenance becomes a non-content tombstone unless the user explicitly requests dependent revocation.
- `RuntimeLifecycleCoordinator` owns the process lock, admission gate, Store factory/current Store, worker lifecycle, and `resetAllData`; the application service never tries to close or recreate its own repository.
- Full reset enters maintenance mode, rejects all DB-backed reads and mutations, waits for in-flight handlers, stops workers, checkpoints/truncates WAL, and retains the process lock for the entire operation. The coordinator then closes SQLite, removes only the exact configured database plus its `-wal`, `-shm`, and `-journal` siblings, recreates the Store/application graph, clears audit history, restarts workers, and resumes service. Recreate failure leaves Runtime closed in maintenance/error rather than serving a partial store. The runtime lock is released only when the process exits. Tests use a temporary, fully resolved path, resolve an existing database symlink to its final canonical file, assert every deletion target before removal, and prove a second Runtime still cannot start during reset.

**Step 7: Run tests**

```bash
corepack pnpm --filter @companion-preference/runtime-local test
```

Expected: PASS.

**Step 8: Commit**

```bash
git add apps/runtime-local pnpm-lock.yaml
git commit -m "feat: orchestrate governed preference learning"
```

## Task 10: Expose an authenticated loopback HTTP API and typed client

**Files:**

- Create: `apps/runtime-local/src/server.ts`
- Create: `apps/runtime-local/src/server.test.ts`
- Create: `apps/runtime-local/src/auth.ts`
- Create: `apps/runtime-local/src/auth.test.ts`
- Create: `packages/runtime-client/package.json`
- Create: `packages/runtime-client/tsconfig.json`
- Create: `packages/runtime-client/src/index.ts`
- Create: `packages/runtime-client/src/client.ts`
- Create: `packages/runtime-client/src/client.test.ts`

**Step 1: Freeze and add Hono dependencies**

The high tier checks the current Hono advisory history and Node adapter compatibility, then freezes an exact tested version not lower than the known 4.12.7 security fix line plus a compatible `@hono/node-server`. Record the decision in the lockfile; the low tier may not change it.

**Step 2: Write failing API security tests**

Test:

- server binds only to `127.0.0.1`;
- missing or incorrect bearer token returns 401;
- unapproved Origin returns 403;
- health contains no private data;
- evidence endpoint returns 202 quickly and processing continues asynchronously;
- invalid Valibot input returns 400;
- collection/learn/apply settings are enforced server-side;
- suppress and adapter-status updates validate host/scope and settings revision;
- content-free policy-decision input rejects message text, evidence payloads, and unknown fields;
- every non-reset user mutation requires a stable `actionId`; replaying the same request returns its stored result and reusing the ID with another payload returns 409;
- effective-profile and connection reads return revision/ETag and honor conditional polling with 304 without exposing evidence content;
- reset endpoint requires an exact confirmation phrase.

Document the M1 threat model beside the tests: all clients possessing the one local bearer token are trusted. CORS protects browser use only. A caller-provided `hostId` and `allowedHosts` prevent accidental misprojection, not deliberate impersonation by another authenticated local process. Host-bound capabilities are deferred before any multi-user or untrusted-plugin deployment.

**Step 3: Define routes**

```text
GET    /health
POST   /v1/evidence
POST   /v1/policy-decisions
GET    /v1/candidates
POST   /v1/candidates/propose
POST   /v1/candidates/:id/confirm
POST   /v1/candidates/:id/reject
POST   /v1/candidates/:id/suppress
DELETE /v1/candidates/:id
GET    /v1/preferences
POST   /v1/preferences
POST   /v1/preferences/:id/revise
POST   /v1/preferences/:id/revoke
POST   /v1/profile/effective
GET    /v1/connections
PATCH  /v1/connections/:hostId
POST   /v1/connections/:hostId/projection-status
GET    /v1/audit
GET    /v1/export
DELETE /v1/evidence/:id
POST   /v1/reset
```

The server receives the `RuntimeLifecycleCoordinator`; `/v1/reset` enters its admission gate and calls coordinator-owned reset. It must not call a repository or application-service delete routine directly.

**Step 4: Implement the typed runtime client**

The client accepts `{ baseUrl, token, fetch? }`, validates responses with contracts, and exposes one method per route. Mutation requests carry expected revisions where applicable. It throws typed errors without logging response bodies that may contain private data.

**Step 5: Run tests**

```bash
corepack pnpm --filter @companion-preference/runtime-local test -- server
corepack pnpm --filter @companion-preference/runtime-client test
```

Expected: PASS.

**Step 6: Smoke-test the service**

Run the runtime with a temporary database and fake observer:

```bash
COMPANION_RUNTIME_TOKEN=test-token COMPANION_DB_PATH=/tmp/companion-preference-smoke.sqlite corepack pnpm --filter @companion-preference/runtime-local dev
```

In another terminal:

```bash
curl -H 'Authorization: Bearer test-token' http://127.0.0.1:43120/health
```

Expected: JSON reports `status: "ok"` and no profile data.

**Step 7: Commit**

```bash
git add apps/runtime-local packages/runtime-client pnpm-lock.yaml
git commit -m "feat: expose authenticated local runtime api"
```

## Task 11: Build the Inspector shell and connection controls

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
- Create: `apps/inspector/src/pages/ConnectionsPage.test.ts`

**Step 1: Add Vue dependencies**

Use Vue `3.5.32`, Vue Router `4`, Vite `8.0.8`, `@vitejs/plugin-vue`, `@vue/test-utils`, and `happy-dom` for component tests. Do not add a component library in the first slice.

**Step 2: Write a failing connections-page test**

The test should render one AIRI connection and verify separate controls for:

- observe;
- learn;
- apply;
- proactive, displayed as unavailable;
- runtime/adapter connection state;
- configured Observer provider/model label.

It must verify that disabling apply asks for confirmation, patches the connection setting with the expected revision, and distinguishes `clearing/unverified`, `tombstone-locally-written`, `verified-guidance-absent`, and `error` from adapter status. There is no imaginary clear-context endpoint and a local socket write is not displayed as verified clearing.

**Step 3: Implement the app shell and connections page**

Routes:

```text
/connections
/pending
/profile
/data
```

Keep credentials outside local storage. In development, Vite proxies `/api` to the runtime and injects the token from an environment variable. Production packaging is a later milestone. For the M1 gate, `/connections`, `/pending`, and `/profile` are required; `/data` remains a clearly marked follow-on until Task 17.

**Step 4: Run component tests**

```bash
corepack pnpm --filter @companion-preference/inspector test -- ConnectionsPage
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/inspector pnpm-lock.yaml
git commit -m "feat: add inspector connection controls"
```

## Task 12: Build the minimum candidate review and active-profile UI

**Files:**

- Create: `apps/inspector/src/components/CandidateCard.vue`
- Create: `apps/inspector/src/components/CandidateCard.test.ts`
- Create: `apps/inspector/src/pages/PendingPage.vue`
- Create: `apps/inspector/src/pages/PendingPage.test.ts`
- Create: `apps/inspector/src/pages/ProfilePage.vue`
- Create: `apps/inspector/src/pages/ProfilePage.test.ts`

**Step 1: Write failing candidate-card tests**

Verify the card shows:

- readable preference label and proposed value;
- scope and host visibility;
- evidence and counter-evidence;
- confidence as supporting information, not authority;
- confirm;
- edit then confirm;
- change scope;
- reject;
- suppress similar candidates.

No action may optimistically display the preference as active before the runtime confirms the transaction.

**Step 2: Implement pending review**

Poll the runtime at a modest interval only while the page is visible. Group duplicates and conflicts. After an action, refresh both Pending and Active Profile.

**Step 3: Implement Active Profile**

Group records by domain, host visibility, and scope. Show why each record applies, its authority, revision, source evidence references, and revise/revoke controls. Revision sends an explicit user action and atomically supersedes the old active record; neither action is shown optimistically.

**Step 4: Run UI tests and typecheck**

```bash
corepack pnpm --filter @companion-preference/inspector test
corepack pnpm --filter @companion-preference/inspector typecheck
```

Expected: PASS.

Data/history UI, packaging, and visual polish are deliberately not M1 blockers. Export, deletion, and reset remain available through the typed client and are added to the Inspector only in Task 17 after the core loop passes.

**Step 5: Commit**

```bash
git add apps/inspector
git commit -m "feat: review and manage preference profiles"
```

## Task 13: Add the first host-neutral reference chat client

**Files:**

- Create: `apps/reference-host/package.json`
- Create: `apps/reference-host/tsconfig.json`
- Create: `apps/reference-host/src/index.ts`
- Create: `apps/reference-host/src/chat-client.ts`
- Create: `apps/reference-host/src/chat-client.test.ts`
- Create: `apps/reference-host/src/render-guidance.ts`
- Create: `apps/reference-host/src/render-guidance.test.ts`

**Step 1: Write failing host behavior tests**

Test that the reference host:

- queries effective preferences before each model request;
- renders only structured Guidance into its developer message;
- submits only the current user and assistant messages as Evidence after completion;
- uses a stable `hostId`, `sessionId`, `sourceRef`, `userId`, `companionId`, and `relationshipId`;
- continues chatting if runtime is unavailable;
- never submits API keys or the generated developer prompt as Evidence.

**Step 2: Implement a terminal reference host**

Use Node `readline/promises`. It is intentionally small and real: it calls an OpenAI-compatible chat endpoint, applies the effective Guidance, prints the response, and submits the completed turn to the runtime. It proves the first host-neutral closed loop, not two-host reuse and not a product UI; two-host reuse is proven only after AIRI passes Task 15.

**Step 3: Run tests**

```bash
corepack pnpm --filter @companion-preference/reference-host test
```

Expected: PASS with both runtime and model HTTP calls mocked.

**Step 4: Manual smoke test with fake model transport**

Run the reference host against a deterministic local fake server. Confirm:

1. first reply has no personalization;
2. a candidate appears in Inspector;
3. confirmation activates the preference;
4. next request contains the matching rendered guidance;
5. revocation removes it.

**Step 5: Commit**

```bash
git add apps/reference-host pnpm-lock.yaml
git commit -m "feat: validate the first host-neutral preference loop"
```

## Task 14: Expand the evaluation suite and run the M1 model gate

**Files:**

- Modify: `evals/datasets/work-core-v1.jsonl`
- Modify: `evals/datasets/cross-domain-core-v1.jsonl`
- Create: `evals/datasets/work-v1.jsonl`
- Create: `evals/datasets/cross-domain-v1.jsonl`
- Create: `evals/datasets/confirmation-burden-v1.jsonl`
- Create: `evals/datasets/manifest-v2.json`
- Create: `evals/src/baselines/full-history.ts`
- Modify: `evals/src/candidate-eval.ts`
- Create: `evals/src/behavior-eval.ts`
- Create: `evals/src/report.ts`
- Create: `evals/src/report.test.ts`
- Create: `evals/src/run-model-gate.ts`
- Create: `evals/reports/.gitkeep`

**Step 1: Expand the already-frozen dataset under review**

Grow the 24-case M0 set to at least 60 synthetic, consented, or anonymized cases without rewriting labels to fit the current prompt:

- 15 explicit or repeated work preferences;
- 10 temporary states that must not become preferences;
- 10 conflicts or changes;
- 10 ambiguous abstention cases;
- 15 cross-domain counterfactual pairs.

Add a separate sequential background set of at least 100 ordinary work turns with no gold preference change. It measures unnecessary confirmation burden without being distorted by the deliberately preference-heavy 60-case quality set.

The high tier expands the external held-out labels without placing them in the shared workspace, then creates `manifest-v2.json` with new immutable counts and hashes; `manifest-v1.json` is never rewritten. Any correction to an existing gold label requires another manifest version and reviewed reason. Never insert the user's private conversation history.

**Step 2: Complete the baseline matrix**

Retain no-personalization, plain-memory, strong semantic Memory/RAG, and manual-profile baselines from Task 6; add full-history. Keep the same backbone model, token/retrieval budget, and generation settings across compared systems. Baselines may receive only the consented evaluation turns, not private application data.

**Step 3: Run candidate-quality gates with the configured Observer**

Report precision, recall, abstention accuracy, conflict/change accuracy, deterministic cross-domain leakage, and candidates per 20 turns. Fail M1 when:

- precision is below 0.80;
- conflict/change accuracy is below 0.85;
- deterministic privacy leakage is non-zero;
- unnecessary candidate frequency exceeds 1 pending confirmation per 20 turns on the frozen 100-turn background set.

Recall is reported but is not allowed to lower the precision threshold by producing speculative candidates. Automated tests use fixture outputs; a separately invoked model run requires explicit local/remote outbound policy and writes only aggregate results plus case IDs. M1 gates candidate quality and the reference-host loop; it does not claim a human preference win or two-host reuse.

**Step 4: Add blinded behavior export**

Randomize system labels and export paired responses for later human judgment. Do not use the same model that generated responses as the only judge. Store judgments separately from source text. The export must work in M1, but blind preference results and real-user acceptance are evaluated in M4 rather than fabricated as an automated pass condition.

**Step 5: Run the M1 gate before AIRI work**

```bash
corepack pnpm --filter @companion-preference/evals test
corepack pnpm --filter @companion-preference/evals eval:model-gate
```

Expected: deterministic tests PASS; the high tier runs the sealed held-out set and the explicitly configured model run produces a versioned aggregate report containing dataset hash, model/provider, parameters, token budget, and baseline versions. Stop for user review. Do not start Task 15 if a binding threshold fails or the reference-host loop did not close.

**Step 6: Commit**

```bash
git add evals
git commit -m "test: gate governed preference quality"
```

## Task 15: Run an AIRI protocol spike, then build the Sidecar adapter

**Files:**

- Create: `adapters/airi/package.json`
- Create: `adapters/airi/tsconfig.json`
- Create: `adapters/airi/src/index.ts`
- Create: `adapters/airi/src/airi-transport.ts`
- Create: `adapters/airi/src/airi-transport.test.ts`
- Create: `adapters/airi/src/map-turn.ts`
- Create: `adapters/airi/src/map-turn.test.ts`
- Create: `adapters/airi/src/render-context.ts`
- Create: `adapters/airi/src/render-context.test.ts`
- Create: `adapters/airi/src/sidecar.ts`
- Create: `adapters/airi/src/sidecar.test.ts`
- Create: `adapters/airi/src/fixtures/chat-complete.ts`
- Create: `docs/airi-protocol-spike.md`

**Step 1: Freeze the observed protocol facts before adapter implementation**

Use this exact protocol baseline during the spike:

```text
AIRI: d22daf6b4c1cfe76917206d58e37c8390cadbe38
SDK:  @proj-airi/server-sdk@0.11.3
```

Inspect both the pinned AIRI runtime/Stage implementation and SDK, then record executable evidence in `docs/airi-protocol-spike.md`. The spike must confirm or update all of these facts before the Go decision:

- `output:gen-ai:chat:complete` is received through `client.onEvent(...)`; it is a broadcast event, so `module:consumer:register` must not be sent and `possibleEvents` is announcement metadata rather than a subscription filter;
- the event currently includes `composedMessage`, contexts, input, and current messages before the Sidecar can filter them;
- the formal event lacks stable `sessionId`, `characterId`, user scope, and domain;
- `replace-self` replaces the sending event source bucket, not `contextId`;
- the runtime recognizes array destinations using actual event-source identities;
- SDK send success is a local WebSocket-write guarantee, not a Stage/server acknowledgement;
- publishing empty text leaves a blank source-bucket tombstone rather than removing the bucket.

If any fact changed, update this plan's adapter contract before proceeding. Do not implement against a guessed API.

**Step 2: Add the published AIRI SDK and stable identity**

Use `@proj-airi/server-sdk@0.11.3`, isolated to this adapter package. Construct the SDK client with a stable source identity so restarts reuse the same `replace-self` bucket:

```ts
const extension = {
  id: 'companion-preference-engine',
  version: packageVersion,
}

const identity = {
  id: 'airi-sidecar',
  extension,
}
```

Do not put a second `metadata.source` field inside `context:update` data and assume it controls the bucket; the event-envelope source identity does.

**Step 3: Write failing mapping and privacy-boundary tests**

Given an `output:gen-ai:chat:complete` fixture containing user message, assistant message, `composedMessage`, contexts, input metadata, and tool data, assert that `mapAiriTurnToEvidence` returns only:

- explicitly opted-in user/assistant text in `learningPayload`;
- fixed configured local `userId`, `companionId`, `relationshipId`, and a single-session sentinel;
- `event.metadata.event.id` as `sourceRef`;
- domain and the three policies from AIRI connection settings.

Assert that the serialized Sidecar → runtime request does not contain `composedMessage`, system prompts, contexts, tools, or arbitrary input metadata. AIRI does not identify code/terminal fragments embedded inside chat text, so the adapter must not claim reliable regex filtering. Default AIRI collection and remote outbound inference to off; the user must explicitly allow unclassified AIRI chat text, and the first AIRI PoC keeps its Observer local-only.

Also assert that collection disabled causes immediate in-memory content discard: no `/v1/evidence` call, file write, analytics event, or raw-event log. The Sidecar may call only content-free `/v1/policy-decisions` and `projection-status`, carrying connection/revision/reason identifiers but no message text or event payload. Document that this cannot prevent the richer AIRI event from first reaching the Sidecar process under the current protocol.

**Step 4: Define a testable AIRI transport port**

```ts
export interface AiriTransport {
  connect(): Promise<void>
  onChatComplete(handler: (event: AiriChatComplete) => Promise<void>): () => void
  publishContext(update: AiriContextUpdate): Promise<void>
  close(): Promise<void>
}
```

`publishContext` means the SDK completed a connected local write; it must not be named or documented as remote acknowledgement. The production implementation wraps `@proj-airi/server-sdk`; unit tests use a fake transport.

**Step 5: Implement broadcast observation and sanitized ingestion**

Connect to `AIRI_WS_URL` (default `ws://127.0.0.1:6121/ws`), authenticate with `AIRI_TOKEN` if supplied, announce the stable adapter identity, and attach `client.onEvent('output:gen-ai:chat:complete', handler)`. Never register a module consumer for this broadcast event.

Because all peers can broadcast the same event name, reject before mapping unless the event has a valid `gen-ai:chat` structure, exactly one supported Stage marker (`stage-web === true` or `stage-tamagotchi === true`), and a matching envelope source/module identity. Add a fixture proving a Discord or unknown peer's same-named event is discarded. Post only validated Evidence to the local runtime without blocking AIRI.

Because the 0.11.3 event has no formal session/character/user/domain contract, require explicit configuration for one local identity, one domain, and one sentinel session scope. Do not infer multi-session or multi-character support. Record an upstream request for stable turn/session/character/user fields and an authorized minimal turn event.

**Step 6: Implement confirmed-profile projection with honest delivery state**

Independently of incoming AIRI chat events, conditionally poll the runtime's effective-profile and connection revisions at a bounded interval (start at 2 seconds, back off while disconnected, and use ETag/304). This is how confirmation, revocation, or disabling apply produces a prompt update/tombstone even when AIRI emits no new conversation event. Tests use fake timers and prove a runtime revision change reaches `publishContext` within the bound without carrying evidence content.

Compute a hash over normalized Guidance plus sorted applied preference IDs. Publish when that hash, effective-profile revision, or `applyEnabled` changes, and re-publish the current idempotent projection after Sidecar WebSocket reconnect, after `registry:modules:sync` reports a target Stage newly present, or after a target `extension:module:announced`. If those lifecycle signals prove unreliable in the pinned runtime, use a documented low-frequency Stage refresh fallback. This is required because Stage reload loses its in-memory Context Registry even when the Sidecar hash is unchanged.

Render a concise `[Confirmed Companion Preferences]` block and send with the stable client identity:

```ts
{
  id: crypto.randomUUID(),
  contextId: 'companion-preferences:confirmed-profile',
  strategy: 'replace-self',
  text,
  destinations: [
    WebSocketEventSource.StageWeb,
    WebSocketEventSource.StageTamagotchi,
  ],
}
```

Use `ensureConnected()` and the SDK's throwing send path. Report connection state through `Client.onConnectionStateChange` in the same content-free status payload. Projection states are `locally-written`, `verified-applied`, `tombstone-locally-written`, `verified-guidance-absent`, or `error`.

When apply is disabled or all records are revoked, publish empty text as a documented blank-tombstone workaround; it removes confirmed guidance text but does not empty the AIRI bucket. A successful local write remains `tombstone-locally-written` and Inspector stays clearing/unverified. Promote to `verified-guidance-absent` only after the next valid Stage chat-complete snapshot contains none of the confirmed guidance, or after explicit manual DevTools verification. Apply the equivalent distinction between `locally-written` and `verified-applied` for non-empty projection. Record an upstream request for `remove-self` or source-bucket clearing.

**Step 7: Run adapter tests**

```bash
corepack pnpm --filter @companion-preference/adapter-airi test
```

Expected: PASS without starting AIRI.

**Step 8: Run a real AIRI smoke test**

With the user's local AIRI runtime running:

1. configure the fixed local identity, work domain, and single-session sentinel;
2. explicitly enable collection/learning for unclassified AIRI chat text while keeping outbound inference local-only;
3. complete one work conversation, inspect the pending candidate, and confirm it;
4. on the next turn, verify the Companion source bucket's non-empty text equals the rendered confirmed guidance; do not assert that the whole AIRI prompt contains only this block;
5. disable apply, observe `tombstone-locally-written`, and keep the UI unverified;
6. on the following valid Stage turn, verify that the source bucket contains none of the confirmed guidance text, promote to `verified-guidance-absent`, and accept the known empty bucket line;
7. inspect the Sidecar → runtime HTTP boundary and assert that its request contains none of `composedMessage`, contexts, tools, or system prompts;
8. record the two current limitations: AIRI → Sidecar still carries the full model input, and blank tombstones do not remove the source bucket.

**Step 9: Commit**

```bash
git add adapters/airi docs/airi-protocol-spike.md pnpm-lock.yaml
git commit -m "feat: connect governed preferences to airi"
```

## Task 16: Add an MCP read and governed-proposal surface

**Files:**

- Create: `servers/mcp/package.json`
- Create: `servers/mcp/tsconfig.json`
- Create: `servers/mcp/src/index.ts`
- Create: `servers/mcp/src/server.ts`
- Create: `servers/mcp/src/server.test.ts`

**Step 1: Add the official SDK**

The high tier selects the current stable official MCP server package/version, pins it with the shared runtime client, and freezes a schema-dialect interoperability smoke test against the intended Codex/MCP client. Do not hand the low tier the previous 1.29.0 pin without this preflight.

**Step 2: Write failing MCP tool tests**

Expose:

```text
get_effective_preferences
list_pending_candidates
explain_preference
propose_preference_candidate
```

Bind the MCP process to one configured `McpPrincipal`/capability containing `userId`, `companionId`, `relationshipId`, `hostId`, allowed domains, and allowed operations. Tool arguments cannot override that identity. Expose a read-only scoped resource such as:

```text
preference://profiles/{userId}/{companionId}/{relationshipId}/{hostId}/{domain}
```

Advertise and resolve only exact URIs derived from the configured principal/capability; a caller cannot enumerate or substitute path fields.

Test that:

- every call delegates to the canonical runtime;
- there is no passive conversation-observation tool;
- principal host/domain scope is mandatory and caller-supplied identity overrides are rejected;
- `propose_preference_candidate` records actor/provenance as `mcp-agent-proposed` and always creates a pending candidate;
- proposal uses the canonical Task 10 route/client, action receipt, scope checks, and an idempotency key derived from principal + proposal provenance rather than a fabricated Evidence ID;
- MCP exposes no confirm, reject, revoke, or direct-active-profile mutation in M3 because a model tool call is not proof of an explicit human action;
- confirmation continues through Inspector or a future capability-bound human UI channel;
- errors redact local tokens and private payloads.

**Step 3: Implement stdio MCP server**

The MCP process owns no database and no scheduled jobs. It reads runtime URL and token from environment variables and exits clearly when runtime is unavailable.

**Step 4: Run tests and MCP inspector smoke test**

```bash
corepack pnpm --filter @companion-preference/mcp-server test
```

Expected: PASS. Then connect with an MCP inspector and verify the resource and tools operate against a temporary runtime.

**Step 5: Commit**

```bash
git add servers/mcp pnpm-lock.yaml
git commit -m "feat: expose confirmed preferences over mcp"
```

## Task 17: Add end-to-end acceptance tests and operational documentation

**Files:**

- Create: `tests/e2e/preference-loop.test.ts`
- Create: `tests/e2e/privacy-boundary.test.ts`
- Create: `tests/e2e/deletion-reset.test.ts`
- Create: `tests/e2e/single-writer.test.ts`
- Create: `tests/e2e/fixtures/fake-model.ts`
- Create: `apps/inspector/src/pages/DataPage.vue`
- Create: `apps/inspector/src/pages/DataPage.test.ts`
- Create: `docs/development.md`
- Create: `docs/privacy-model.md`
- Create: `docs/airi-integration.md`
- Create: `docs/evaluation.md`
- Modify: `README.md`
- Modify: `vitest.config.ts`

**Step 1: Write the end-to-end preference loop**

Start a temporary runtime with SQLite and Fake Observer, then drive the typed client through:

```text
ingest turn
→ wait for candidate
→ assert effective profile empty
→ confirm
→ assert guidance active
→ restart runtime
→ assert guidance persists
→ revoke
→ assert guidance empty
```

Repeat the processing portion with injected crashes before and after Observer output and after atomic completion. The worker may retry, but the final state contains one logical candidate.

**Step 2: Write the privacy boundary E2E test**

Insert a companion-domain sensitive preference and a work-domain preference. Query from the reference host/work and verify only the work record is projected; query from AIRI/companion and verify configured projection. Assert audit logs contain IDs and reason codes but no raw learning payload. Name this a logical projection boundary under the trusted-local-client threat model, not protection against a malicious process holding the shared bearer token.

**Step 3: Write failing deletion, reset, one-writer, and Data-page tests**

Verify the Task 9 deletion graph for pending and confirmed records. Full reset must retain the process lock, close the store, remove the exact temporary database, `-wal`, `-shm`, and `-journal`, then recreate an empty store with no audit history. During maintenance, both reads and mutations fail closed. Launch two child runtimes against path aliases/symlinks resolving to the same canonical database and verify the second exits before migration both during normal service and while the first Runtime is resetting.

Before implementing the page, write component tests for export, evidence deletion, candidate deletion, optional dependent preference revocation, preference revision/revocation, exact reset confirmation, and “pause collection is not deletion.” Run the focused E2E and component tests and verify they fail for the intended missing behavior.

**Step 4: Implement the minimum Data & History page and make the tests green**

Add only the behavior covered above. Do not optimistically show deletion/reset complete before the Runtime transaction and lifecycle restart succeeds.

**Step 5: Run all checks**

```bash
corepack pnpm check
```

Expected:

- all package typechecks PASS;
- all unit, contract, integration, and E2E tests PASS;
- `git diff --check` PASS.

**Step 6: Perform the real vertical-slice acceptance run**

With local AIRI and the standalone runtime:

1. open Inspector;
2. explicitly opt AIRI into unclassified chat collection and learning, with outbound inference local-only;
3. create a work preference through conversation;
4. confirm the candidate;
5. verify AIRI behavior changes on the next comparable prompt;
6. verify the reference host receives the same preference when privacy allows it;
7. disable apply per connection and confirm both hosts stop receiving guidance; for AIRI, distinguish the locally written blank tombstone from next-turn `verified-guidance-absent`;
8. export and then fully reset test data;
9. confirm SQLite no longer contains the deleted profile or evidence.

**Step 7: Run the Go/No-Go review**

First record the engineering acceptance evidence:

- candidate metrics versus baselines;
- confirmation burden;
- cross-domain leakage results;
- second-host core reuse findings;
- AIRI integration gaps requiring upstream discussion.

Passing these checks completes M4 engineering acceptance only. Before collecting human judgments, the high tier freezes the randomization, win/tie/loss rubric, exclusion/withdrawal handling, and report template. A product Go additionally requires:

- the analysis unit for response preference is one participant × one pre-registered scenario pair; blinded same-model/same-budget comparison must give the Preference Engine at least 60% of non-tied valid pair wins against the strongest Memory/RAG baseline, with ties and invalid pairs reported separately;
- 8–12 target users and at least 8 completed evaluations; withdrawals are reported rather than silently replaced, and any privacy-related withdrawal triggers review before Go;
- candidate acceptance of at least 60%, where the numerator is accepted or edited-then-confirmed candidate groups and the denominator is every distinct group presented during completed sessions, including rejected, suppressed, dismissed, or timed-out groups;
- unnecessary confirmation burden no higher than one presented candidate group per 20 eligible ordinary turns in the pre-registered background scenarios;
- zero deterministic cross-domain leakage and zero severe unintended sensitive disclosure; additionally, more than 20% of completed users reporting privacy discomfort blocks Product Go pending redesign.

Record sample size, assignment/randomization method, failures, and withdrawals. If the human sample has not run, mark product status `NOT_EVALUATED`, not Go. Do not proceed to Identity, Relationship, Reflection, Proactivity, sync, avatar, or robot work unless both engineering and product gates pass; otherwise stop or shrink to an Explicit Companion Profile/data-contract project.

**Step 8: Commit**

```bash
git add README.md docs tests apps/inspector vitest.config.ts
git commit -m "docs: verify the preference engine vertical slice"
```

## Final verification checklist

Run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
git status --short
git log --oneline --decorate -20
git ls-files '*.sqlite' '*.sqlite-*' '*.db' '.env' '.env.*'
```

Expected:

- clean install succeeds;
- all checks pass;
- working tree is clean;
- commit history shows one focused commit per task;
- AIRI repository remains unchanged;
- the recorded AIRI baseline/final `HEAD` and `git status --short` match;
- the tracked-artifact listing is empty except explicitly reviewed non-secret examples;
- the high tier runs an approved secret scan and verifies no real API key, raw private conversation, generated database, or runtime token is tracked.

## Explicitly deferred work

- Companion Identity manifest and portability.
- Relationship State and shared-experience semantics.
- Memory Provider integration with Plast Mem, Alaya, Mem0, Letta, or Graphiti.
- Goal and Reflection workers.
- Proactivity policy, quiet hours, global deduplication, and notification delivery.
- Cloud account, multi-device sync, CRDTs, and multi-user tenancy.
- Desktop packaging and auto-start UX.
- Live2D, TTS, avatar generation, and robot embodiment.
- Broad Kimi or Doubao adapters without stable public integration surfaces.

Each deferred area requires a separately approved design and its own Go/No-Go gate.
