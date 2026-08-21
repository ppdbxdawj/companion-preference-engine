# M0.5 Terminal Experience Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a deterministic, in-memory terminal experience after M0 so the user can judge the governed candidate → confirmation → guidance → revocation loop before M1 infrastructure work.

**Architecture:** `apps/m0-terminal` is a thin orchestration and presentation shell over the already-approved contracts, fake observer, in-memory repository, lifecycle, and resolver. It owns no new preference rules and performs no network or persistence. The shell displays deterministic response previews so governance effects are visible without claiming real model quality.

**Tech Stack:** Node.js 24.19, pnpm 10.34.5, TypeScript 5.9, Vitest 4.1, Node `readline/promises`, existing workspace packages only.

---

## Execution gate and routing

Do not start this plan until the original implementation plan's Tasks 1–6 pass the complete M0 Gate. The high-tier role must first freeze the actual Task 3–6 exports used below. If those exports differ from the names assumed here, update this plan under review instead of adding duplicate domain logic to `apps/m0-terminal`.

Every implementation package follows the committed routing:

```text
gpt-5.6-sol / low freezes tests and boundaries
→ gpt-5.3-codex-spark implements the frozen shell
→ a fresh gpt-5.6-sol / low verifies
→ root commits
```

Never modify `/Users/bytedance/Documents/ChatGPT/Airi/airi` while executing this plan.

## Task 0: Reconfirm M0 and freeze the terminal adapter surface

**Files:**

- Read: `docs/plans/2026-08-20-companion-preference-engine.md`
- Read: `docs/plans/2026-08-21-m0p5-terminal-experience-design.md`
- Read: `packages/preference-core/src/index.ts`
- Read: `packages/observer/src/index.ts`
- Create: `/private/tmp/cpe-m0p5-task-packet.md` (not tracked)

**Step 1: Run the complete M0 Gate**

Run with the pinned offline Node/pnpm runner:

```bash
pnpm --offline --filter @companion-preference/contracts test
pnpm --offline --filter @companion-preference/contracts typecheck
pnpm --offline --filter @companion-preference/preference-core test
pnpm --offline --filter @companion-preference/observer test
pnpm --offline --filter @companion-preference/evals test
```

Expected: all commands PASS. Stop if any package is absent or failing.

**Step 2: Freeze the exact reusable exports**

The packet must identify the actual exported equivalents of:

```ts
PreferenceObserver
FakePreferenceObserver
PreferenceRepository
InMemoryPreferenceRepository
resolveEffectiveProfile
```

It must also freeze the repository commands used to propose, confirm, reject, revoke, list candidates, and list active preferences. No new raw-save method may be added for the demo.

**Step 3: Freeze no-network and no-persistence oracles**

The packet forbids `fetch`, sockets, environment API keys, SQLite, filesystem writes, HTTP, MCP, AIRI, and background processes. Tests must fail if the terminal package imports any runtime, SQLite, AIRI, or MCP package.

**Step 4: Record the Gate result**

Expected: a high-tier packet with base commit, plan hashes, exact allowed files, frozen exports, failing test ownership, commands, and escalation rules. Do not commit the packet.

## Task 1: Scaffold the deterministic terminal package

**Files:**

- Create: `apps/m0-terminal/package.json`
- Create: `apps/m0-terminal/tsconfig.json`
- Create: `apps/m0-terminal/src/scenario.ts`
- Create: `apps/m0-terminal/src/scenario.test.ts`
- Create: `apps/m0-terminal/src/preview.ts`
- Create: `apps/m0-terminal/src/preview.test.ts`
- Modify: `pnpm-lock.yaml` (root only, importer update; no new external dependency)

**Step 1: Write failing synthetic-scenario tests**

Freeze one work scenario and one companion-domain counterexample. Tests require stable IDs/timestamps, synthetic text only, and these preference proposals:

```ts
{
  key: 'interaction.response_detail',
  value: 'concise',
}

{
  key: 'companion.support_style',
  value: 'listen_first',
}
```

Expected: FAIL because `scenario.ts` does not exist.

**Step 2: Implement the frozen scenarios**

Export immutable `workScenario` and `companionCounterexample` values using contracts types. Do not copy real user conversation text.

**Step 3: Write failing deterministic-preview tests**

Test this pure API:

```ts
export type Preview = {
  mode: 'baseline' | 'concise'
  label: 'Deterministic preview'
  text: string
}

export function renderDeterministicPreview(
  guidance: BehaviorGuidance,
): Preview
```

An empty Guidance returns the baseline template. `{ responseDetail: 'concise' }` returns the concise template. The label is mandatory so the output cannot be mistaken for a model response.

**Step 4: Implement the minimum preview renderer**

Use two fixed strings. Do not generate text, call a model, or interpret preference keys outside the one frozen preview behavior.

**Step 5: Run focused tests**

```bash
pnpm --offline --filter @companion-preference/m0-terminal test -- scenario preview
```

Expected: PASS.

**Step 6: Root updates the lockfile and commits after H-verify**

```bash
git add apps/m0-terminal pnpm-lock.yaml
git commit -m "test: scaffold m0.5 terminal experience"
```

## Task 2: Orchestrate the governed loop through formal ports

**Files:**

- Create: `apps/m0-terminal/src/session.ts`
- Create: `apps/m0-terminal/src/session.test.ts`
- Create: `apps/m0-terminal/src/create-session.ts`

**Step 1: Write the failing end-to-end session test**

The test drives one in-memory session through:

```text
initial work query → empty Guidance / baseline preview
advance synthetic turn → one pending candidate
before confirmation → still empty Guidance
confirm candidate → active record + concise Guidance
switch to companion and back → scope remains deterministic
revoke preference → empty Guidance / baseline preview
```

The test must inspect state through repository and resolver APIs, never by mutating stored objects.

**Step 2: Add the cross-domain failure test**

Confirm the companion-only record, query the work domain, and require:

```ts
expect(result.guidance.supportStyle).toBeUndefined()
expect(result.excluded).toContainEqual(
  expect.objectContaining({ reason: 'privacy-scope-mismatch' }),
)
```

Use the exact frozen exclusion reason if Task 4 names it differently.

**Step 3: Add illegal-transition and replay tests**

Cover unknown candidate IDs, confirming a rejected candidate, revoking an inactive record, and replaying the same action ID. Failed commands leave the previous state unchanged; a valid replay follows the repository's frozen idempotency result.

**Step 4: Implement `M0ExperienceSession`**

Expose only:

```ts
show(): Promise<ExperienceSnapshot>
next(): Promise<ExperienceSnapshot>
confirm(candidateId: string): Promise<ExperienceSnapshot>
reject(candidateId: string): Promise<ExperienceSnapshot>
revoke(preferenceId: string): Promise<ExperienceSnapshot>
setDomain(domain: 'work' | 'companion'): Promise<ExperienceSnapshot>
reset(): Promise<ExperienceSnapshot>
```

`ExperienceSnapshot` is a read model composed from formal candidate, active-profile, explanation, Guidance, and Preview results. It is not persisted and is not a new domain contract.

**Step 5: Wire only the approved in-memory implementations**

`create-session.ts` constructs `FakePreferenceObserver` and `InMemoryPreferenceRepository` using fixed clock/ID inputs. It must not import the local runtime, SQLite repository, runtime client, AIRI adapter, or MCP server.

**Step 6: Run tests**

```bash
pnpm --offline --filter @companion-preference/m0-terminal test -- session
pnpm --offline --filter @companion-preference/m0-terminal typecheck
```

Expected: PASS.

**Step 7: Commit after H-verify**

```bash
git add apps/m0-terminal/src
git commit -m "feat: demonstrate the governed preference loop"
```

## Task 3: Add the terminal command loop and scripted smoke test

**Files:**

- Create: `apps/m0-terminal/src/command.ts`
- Create: `apps/m0-terminal/src/command.test.ts`
- Create: `apps/m0-terminal/src/render.ts`
- Create: `apps/m0-terminal/src/render.test.ts`
- Create: `apps/m0-terminal/src/main.ts`
- Create: `apps/m0-terminal/src/main.test.ts`

**Step 1: Write failing command-parser tests**

Accept exactly:

```text
help
show
next
confirm <candidate-id>
reject <candidate-id>
revoke <preference-id>
domain work
domain companion
reset
exit
```

Unknown commands and missing/extra arguments return a typed local parse error without calling the session.

**Step 2: Implement the pure command parser**

Return a closed discriminated union. Do not execute commands inside the parser.

**Step 3: Write failing renderer tests**

Require headings for Current domain, Pending, Active Profile, Excluded, Guidance, and `Deterministic preview`. Candidate output includes ID, preference, scope, evidence IDs, confidence-as-information, and confirmation warning.

**Step 4: Implement the renderer**

Render only fields already present in `ExperienceSnapshot`. Never render raw environment data, tokens, or unapproved host-native objects.

**Step 5: Write the scripted process test**

Drive `main` with injected input/output streams:

```text
show
next
confirm <frozen-candidate-id>
show
revoke <frozen-preference-id>
show
exit
```

Assert the transcript contains baseline → pending/no-effect → concise active → baseline revoked in that order. Assert process exit is clean and no files are created.

**Step 6: Implement the readline loop**

Use `node:readline/promises`. Catch typed local/transition errors, print a concise message, and continue. Unexpected errors set a non-zero exit code and never print private object dumps.

**Step 7: Run package checks**

```bash
pnpm --offline --filter @companion-preference/m0-terminal test
pnpm --offline --filter @companion-preference/m0-terminal typecheck
pnpm --offline --filter @companion-preference/m0-terminal build
```

Expected: PASS.

**Step 8: Commit after H-verify**

```bash
git add apps/m0-terminal
git commit -m "feat: add m0.5 terminal walkthrough"
```

## Task 4: Run the human M0.5 checkpoint

**Files:**

- Create: `docs/m0p5-experience-checkpoint.md`
- Modify: `README.md`

**Step 1: Add the run command and limitations**

Document the pinned command:

```bash
pnpm --offline --filter @companion-preference/m0-terminal start
```

State prominently: synthetic data, Fake Observer, in-memory only, deterministic preview, no AIRI, and no evidence of real model quality.

**Step 2: Create an unfilled checkpoint record**

Start with:

```text
Status: NOT_EVALUATED
Candidate understandable: not recorded
Behavior change perceptible: not recorded
Confirm/revoke intuitive: not recorded
Distinct from ordinary memory: not recorded
Decision: NOT_EVALUATED
```

Do not prefill a favorable outcome.

**Step 3: Run all deterministic checks**

```bash
pnpm --offline --filter @companion-preference/m0-terminal test
pnpm --offline --filter @companion-preference/m0-terminal typecheck
pnpm --offline --filter @companion-preference/m0-terminal build
pnpm --offline --filter @companion-preference/preference-core test
pnpm --offline --filter @companion-preference/contracts test
git diff --check
```

Expected: PASS.

**Step 4: Run the walkthrough with the user**

The user operates or reviews the full transcript, then supplies one decision:

```text
CONTINUE
REVISE
STOP
```

Do not start Task 7 of the original plan while the decision is `NOT_EVALUATED` or `REVISE`.

**Step 5: Record evidence and commit**

Record the user's actual answers without reinterpretation. Then:

```bash
git add README.md docs/m0p5-experience-checkpoint.md
git commit -m "docs: record m0.5 experience decision"
```

## Final acceptance

M0.5 is complete only when:

- the original M0 Gate remains green;
- the terminal package uses only formal M0 exports;
- all state changes travel through the governed repository/lifecycle/resolver path;
- no unconfirmed or cross-domain preference changes Guidance;
- confirm and revoke visibly change the deterministic preview;
- no network, persistence, HTTP, MCP, AIRI, or real model is used;
- the user records `CONTINUE`, `REVISE`, or `STOP`.

`CONTINUE` resumes the original Task 7. `REVISE` changes the experience or preference representation and reruns M0.5. `STOP` prevents additional M1 infrastructure investment and triggers a scope review.
