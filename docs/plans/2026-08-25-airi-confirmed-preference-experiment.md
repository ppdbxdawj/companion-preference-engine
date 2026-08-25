# AIRI Confirmed-Preference Experiment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a default-off experimental adapter that projects one manually confirmed companion preference into AIRI and supports an off/on/off human value checkpoint without automatic learning.

**Architecture:** The canonical local Runtime remains the only preference authority. A small private AIRI package polls the Runtime's effective-profile endpoint, renders the existing closed Guidance vocabulary through one shared renderer, and writes an adapter-owned `replace-self` context bucket through the exact AIRI Server SDK release. The default path never subscribes to AIRI's rich chat-complete event.

**Tech Stack:** Node.js 24, TypeScript 5.9, pnpm 10.34.5, Vitest 4.1, existing Runtime Client and contracts, `@proj-airi/server-sdk@0.12.0-beta.1`.

---

## Preconditions and execution roles

Do this work only after the branch containing commit `6113a6d` is preserved on
the remote or merged. Start implementation on a fresh
`feat/airi-confirmed-preference-experiment` branch based on that preserved
state. Do not rewrite the failed M1 report.

Use the previously agreed split:

- **High tier (`gpt-5.6-sol`, high):** Tasks 1, 3, 4, and 7. It freezes
  protocol/security facts, owns AIRI transport semantics, reviews the projection
  state machine, and runs the final release/experience gate.
- **Low tier (`gpt-5.6-luna`, high):** Tasks 2, 5, and 6 after the high tier
  freezes the relevant interfaces. It performs renderer extraction, the
  explicit demo setup, CLI wiring, and routine tests without changing the
  protocol or privacy contract.

Every task stops after its commit for review. No task may enable observation or
learning to rescue a failing experiment.

### Task 1: Freeze the current AIRI protocol and experimental package boundary

**Owner:** high tier

**Files:**

- Create: `adapters/airi/package.json`
- Create: `adapters/airi/tsconfig.json`
- Create: `adapters/airi/src/protocol.ts`
- Create: `adapters/airi/src/protocol.test.ts`
- Create: `adapters/airi/src/index.ts`
- Create: `docs/airi-confirmed-preference-experiment.md`
- Modify: `pnpm-lock.yaml`

**Step 1: Reconfirm the upstream facts**

Fetch official AIRI `main` and record its commit. Confirm that the target still
exports `Client`, `ContextUpdateStrategy`, and `WebSocketEventSource`; that
`context:update` accepts `replace-self`; and that the default SDK client URL is
compatible with the local AIRI runtime.

Run in the AIRI checkout:

```bash
git fetch upstream main
git show --no-patch --format='%H' upstream/main
git show upstream/main:packages/server-sdk/package.json
git show upstream/main:packages/plugin-protocol/src/types/events.ts | rg -n "ContextUpdate|replace-self|output:gen-ai:chat:complete"
```

Expected: the commit and facts either match the design baseline
`d5742dbb7`/`0.12.0-beta.1`, or execution stops and updates the design before
adding dependencies.

**Step 2: Write the failing protocol-boundary test**

Create `protocol.test.ts` with assertions equivalent to:

```ts
import { describe, expect, it } from 'vitest'

import {
  AIRI_CONTEXT_ID,
  AIRI_EXTENSION,
  AIRI_IDENTITY,
  AIRI_POSSIBLE_EVENTS,
  AIRI_PROTOCOL_BASELINE,
} from './protocol.js'

describe('AIRI experimental protocol boundary', () => {
  it('pins the reviewed beta protocol and a stable source bucket', () => {
    expect(AIRI_PROTOCOL_BASELINE).toEqual({
      airiCommit: 'd5742dbb7',
      serverSdk: '0.12.0-beta.1',
    })
    expect(AIRI_EXTENSION.id).toBe('companion-preference-engine')
    expect(AIRI_IDENTITY).toEqual({ id: 'airi-confirmed-preference-experiment', extension: AIRI_EXTENSION })
    expect(AIRI_CONTEXT_ID).toBe('companion-preferences:confirmed-profile')
  })

  it('does not announce or subscribe to rich chat-complete events', () => {
    expect(AIRI_POSSIBLE_EVENTS).toEqual([])
    expect(AIRI_POSSIBLE_EVENTS).not.toContain('output:gen-ai:chat:complete')
  })
})
```

**Step 3: Run the test and verify RED**

Run:

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- protocol.test.ts
```

Expected: FAIL because the package/constants do not exist.

**Step 4: Add the private package and minimum constants**

Use this package boundary:

```json
{
  "name": "@companion-preference/adapter-airi-experiment",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false
}
```

Add exact dependencies only:

```json
{
  "@companion-preference/contracts": "workspace:*",
  "@companion-preference/runtime-client": "workspace:*",
  "@proj-airi/server-sdk": "0.12.0-beta.1"
}
```

`protocol.ts` must export immutable constants and
`AIRI_POSSIBLE_EVENTS = [] as const`. Do not import or reference
`output:gen-ai:chat:complete` in production source.

**Step 5: Install and run the focused gate**

Run:

```bash
corepack pnpm install --frozen-lockfile=false
corepack pnpm --filter @companion-preference/adapter-airi-experiment test
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
git diff --check
```

Expected: protocol test PASS, typecheck PASS, and only the exact SDK version is
added to the lockfile.

**Step 6: Record the protocol report skeleton**

`docs/airi-confirmed-preference-experiment.md` must state:

- experimental, private, and default-off;
- exact AIRI commit and SDK version;
- automatic observation/learning disabled;
- local SDK send is not Stage acknowledgement;
- blank replacement may leave an empty source bucket;
- M1 quality remains deferred and failed, linking `docs/important-todos.md`;
- human outcome is initially `NOT_EVALUATED`.

**Step 7: Commit**

```bash
git add adapters/airi docs/airi-confirmed-preference-experiment.md pnpm-lock.yaml
git commit -m "chore: freeze AIRI experiment protocol"
```

### Task 2: Extract one host-neutral Guidance renderer

**Owner:** low tier, after Task 1 review

**Files:**

- Create: `packages/guidance-renderer/package.json`
- Create: `packages/guidance-renderer/tsconfig.json`
- Create: `packages/guidance-renderer/src/index.ts`
- Create: `packages/guidance-renderer/src/render-guidance.ts`
- Create: `packages/guidance-renderer/src/render-guidance.test.ts`
- Modify: `apps/reference-host/src/render-guidance.ts`
- Modify: `apps/reference-host/package.json`
- Modify: `adapters/airi/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Copy the existing renderer tests into the new package**

Move the behavioral oracle from
`apps/reference-host/src/render-guidance.test.ts` without changing expected
text. Add one additional test proving an empty Guidance returns `undefined`.

**Step 2: Run the new test and verify RED**

```bash
corepack pnpm --filter @companion-preference/guidance-renderer test
```

Expected: FAIL because the shared package and implementation do not exist.

**Step 3: Move, do not duplicate, the implementation**

Move the current `renderGuidance` implementation into
`packages/guidance-renderer/src/render-guidance.ts`. Export it from the package
index. Replace the old reference-host file with a compatibility re-export:

```ts
export { renderGuidance } from '@companion-preference/guidance-renderer'
```

Add the new workspace dependency to both reference-host and the AIRI
experimental package. No wording or ordering change is allowed in this task.

**Step 4: Run renderer and reference-host regression gates**

```bash
corepack pnpm --filter @companion-preference/guidance-renderer test
corepack pnpm --filter @companion-preference/guidance-renderer typecheck
corepack pnpm --filter @companion-preference/reference-host test
corepack pnpm --filter @companion-preference/reference-host typecheck
```

Expected: all PASS, with exactly one renderer implementation in the repository.

**Step 5: Commit**

```bash
git add packages/guidance-renderer apps/reference-host adapters/airi/package.json pnpm-lock.yaml
git commit -m "refactor: share confirmed guidance rendering"
```

### Task 3: Implement the isolated AIRI projection transport

**Owner:** high tier

**Files:**

- Create: `adapters/airi/src/transport.ts`
- Create: `adapters/airi/src/transport.test.ts`
- Modify: `adapters/airi/src/index.ts`

**Step 1: Define a narrow fakeable SDK seam in the test**

The test fake must capture client options and sent events without opening a
socket. Assert:

- stable extension and identity are passed to the SDK client;
- `possibleEvents` is empty;
- `autoConnect` is false;
- a non-empty projection sends one `context:update`;
- `strategy` is `replace-self`;
- destinations are Stage Web and Stage Tamagotchi;
- empty text is accepted as the tombstone workaround;
- a disconnected send throws and is reported as a failed local write;
- no `onEvent` method is called.

**Step 2: Run the transport test and verify RED**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- transport.test.ts
```

Expected: FAIL because `createAiriProjectionTransport` does not exist.

**Step 3: Implement the narrow public port**

Freeze this host-neutral surface before writing the SDK wrapper:

```ts
export type ProjectionConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface AiriProjectionTransport {
  connect(): Promise<void>
  publish(text: string): Promise<void>
  close(): Promise<void>
  connectionState(): ProjectionConnectionState
}
```

The implementation creates the SDK `Client` with the reviewed URL/token,
stable identity, `possibleEvents: []`, and bounded auto-reconnect. `publish`
uses `sendOrThrow` with this shape:

```ts
{
  type: 'context:update',
  data: {
    id: randomUUID(),
    contextId: AIRI_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text,
    destinations: [
      WebSocketEventSource.StageWeb,
      WebSocketEventSource.StageTamagotchi,
    ],
  },
}
```

Do not add a metadata `source` override and do not claim remote acknowledgement.

**Step 4: Run focused gates**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- transport.test.ts
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
```

Expected: PASS without a running AIRI server or network access.

**Step 5: Commit**

```bash
git add adapters/airi/src
git commit -m "feat: add isolated AIRI projection transport"
```

### Task 4: Build the governed projection controller

**Owner:** high tier

**Files:**

- Create: `adapters/airi/src/projection-controller.ts`
- Create: `adapters/airi/src/projection-controller.test.ts`
- Create: `adapters/airi/src/content-free-status.ts`
- Create: `adapters/airi/src/content-free-status.test.ts`
- Modify: `adapters/airi/src/index.ts`

**Step 1: Write controller tests with fake Runtime and transport ports**

Use the fixed query:

```ts
{
  query: {
    userId: 'airi-experiment-user',
    companionId: 'airi-experiment-companion',
    relationshipId: 'airi-experiment-relationship',
    hostId: 'airi',
    sessionId: 'airi-experiment-single-session',
    domain: 'companion',
  },
}
```

Test these transitions:

1. first empty Guidance -> no AIRI write;
2. first confirmed Guidance -> one non-empty write and `locally-written`;
3. unchanged Guidance and revision -> no duplicate write;
4. changed Guidance or settings revision -> one replacement write;
5. non-empty to empty -> one empty write and `tombstone-locally-written`;
6. Runtime unavailable -> no AIRI write and content-free runtime error;
7. AIRI write failure -> content-free transport error and no success claim;
8. projection-status revision conflict -> immediate canonical re-read; if the
   result is empty, publish the empty replacement;
9. status serialization contains no rendered text, preference values, or model
   content.

**Step 2: Run the tests and verify RED**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- projection-controller.test.ts content-free-status.test.ts
```

Expected: FAIL because the controller and status types do not exist.

**Step 3: Implement the smallest state machine**

Define a Runtime port using existing typed DTOs:

```ts
interface ProjectionRuntime {
  getEffectiveProfile(request: EffectiveProfileHttpRequest): Promise<EffectiveProfileHttpResult>
  reportProjectionStatus(command: ReportProjectionStatusCommand): Promise<GovernanceMutationHttpResult>
}
```

Store only:

- last rendered SHA-256 hash;
- last settings revision;
- whether a non-empty projection has been locally written;
- the latest content-free state/error code.

Never store the rendered text after `publish` returns. Render, hash, send, and
drop the local string in the same tick. Use the shared renderer. A first empty
profile is a no-op; an empty profile after a prior non-empty write emits exactly
one empty replacement.

Use the canonical Runtime projection-status command after each local write.
Treat a settings-revision conflict as a reconciliation signal, not a retry of
the stale text.

**Step 4: Run focused and package gates**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
git diff --check
```

Expected: PASS and no raw Guidance assertions appear in status snapshots.

**Step 5: Commit**

```bash
git add adapters/airi/src
git commit -m "feat: project governed preferences into AIRI"
```

### Task 5: Add the explicit, model-free demo setup

**Owner:** low tier, after Task 4 interfaces are frozen

**Files:**

- Create: `adapters/airi/src/demo-config.ts`
- Create: `adapters/airi/src/demo-config.test.ts`
- Create: `adapters/airi/src/demo-setup.ts`
- Create: `adapters/airi/src/demo-setup.test.ts`
- Modify: `adapters/airi/src/index.ts`

**Step 1: Write configuration tests**

Accept exactly one support style:

```text
listen_first
acknowledge_then_act
direct_action
```

Reject unknown styles, missing Runtime URL/token, non-loopback Runtime URLs, and
any attempt to enable observation or learning. The setup configuration must
always produce:

```ts
{
  observeEnabled: false,
  learnEnabled: false,
  applyEnabled: false,
  collectionPolicy: { allowedSources: [], retainContent: false },
  outboundInferencePolicy: { mode: 'disabled' },
  projectionPolicy: { allowedHosts: ['airi'], allowedDomains: ['companion'] },
}
```

**Step 2: Run the tests and verify RED**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- demo-config.test.ts demo-setup.test.ts
```

Expected: FAIL because the setup does not exist.

**Step 3: Implement setup only through the typed Runtime Client**

The setup must:

1. fetch the canonical AIRI connection settings;
2. patch the exact closed policies above with its expected revision;
3. create one explicit `companion.support_style` preference with domain scope
   `companion` and projection limited to AIRI/companion;
4. use an explicit user actor/action and empty `evidenceIds`;
5. stop with a readable conflict if the fixed demo identity already has an
   active support-style preference; it must not edit SQLite or silently revise
   an existing preference;
6. finish with application still off.

Inject the Runtime Client, clock, and ID generator in tests. Assert that no
evidence-ingest or candidate endpoint is called.

**Step 4: Run the setup and regression gates**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- demo-config.test.ts demo-setup.test.ts
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
```

Expected: PASS with all model/learning surfaces absent.

**Step 5: Commit**

```bash
git add adapters/airi/src
git commit -m "feat: add model-free AIRI demo setup"
```

### Task 6: Wire the default-off experiment CLI and content-free report

**Owner:** low tier

**Files:**

- Create: `adapters/airi/src/main.ts`
- Create: `adapters/airi/src/main.test.ts`
- Create: `adapters/airi/src/report.ts`
- Create: `adapters/airi/src/report.test.ts`
- Modify: `adapters/airi/package.json`
- Modify: `docs/airi-confirmed-preference-experiment.md`

**Step 1: Write the CLI boundary tests**

Verify:

- missing `CPE_AIRI_EXPERIMENT_ENABLED=1` exits before constructing SDK or
  Runtime clients;
- setup and run are separate explicit commands;
- run starts the transport, ticks immediately, then polls at a two-second
  interval using injected timers;
- SIGINT/SIGTERM stops polling and closes the transport;
- after a non-empty local write, shutdown attempts one bounded empty replacement;
- the report contains versions, timestamps, settings revisions, hashes, states,
  and a final enum only;
- the report rejects keys or values containing conversation, Guidance text,
  preferences, contexts, tools, or model output.

**Step 2: Run the tests and verify RED**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test -- main.test.ts report.test.ts
```

Expected: FAIL because the CLI and report do not exist.

**Step 3: Add minimal commands**

Expose only:

```text
pnpm --filter @companion-preference/adapter-airi-experiment demo:setup -- --support-style <value>
pnpm --filter @companion-preference/adapter-airi-experiment dev
pnpm --filter @companion-preference/adapter-airi-experiment test
```

The CLI reads secrets from environment variables and never prints them. Do not
add an observation command. Use `runUntilSignal` only if it does not change the
bounded shutdown semantics; otherwise keep a small explicit signal handler.

**Step 4: Implement the report schema**

The report may contain:

```ts
type ExperimentOutcome = 'NOT_EVALUATED' | 'PROMISING' | 'UNCLEAR' | 'NOT_USEFUL'
```

plus content-free protocol metadata and projection outcomes. It may not contain
the selected support-style value. Default outcome remains `NOT_EVALUATED` until
the user explicitly chooses the final label.

**Step 5: Run the package gate**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
corepack pnpm --filter @companion-preference/adapter-airi-experiment build
git diff --check
```

Expected: all PASS without AIRI, Runtime, model access, or network.

**Step 6: Commit**

```bash
git add adapters/airi docs/airi-confirmed-preference-experiment.md
git commit -m "feat: add default-off AIRI experiment CLI"
```

### Task 7: Run the protocol smoke and human value checkpoint

**Owner:** high tier with the user

**Files:**

- Modify: `docs/airi-confirmed-preference-experiment.md`
- Optionally create: `evals/reports/airi-confirmed-preference-experiment-v1.json`

Do not start this task until Tasks 1–6 pass review. Use synthetic prompts only.

**Step 1: Run the repository gate before external processes**

```bash
corepack pnpm --filter @companion-preference/guidance-renderer test
corepack pnpm --filter @companion-preference/reference-host test
corepack pnpm --filter @companion-preference/adapter-airi-experiment test
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
corepack pnpm --filter @companion-preference/adapter-airi-experiment build
git diff --check
```

Expected: PASS. This is the cheap gate; do not run a model evaluation.

**Step 2: Start a clean synthetic Runtime**

Use a dedicated temporary database path and the existing authenticated loopback
Runtime. Do not point the experiment at the user's ordinary profile database.
Record only the Runtime version and loopback endpoint, never its bearer token.

**Step 3: Seed one explicit support style**

Ask the user to select one of the three canonical styles. Run `demo:setup` and
verify in Inspector that:

- observation is off;
- learning is off;
- application is off;
- one explicit companion preference exists;
- projection is limited to host AIRI and domain companion.

**Step 4: Start current AIRI and the experiment adapter**

Start AIRI's server channel/Stage and then the default-off experiment with the
explicit enable flag. Verify the adapter reports connected without subscribing
to completion events.

**Step 5: Run the off/on/off protocol sequence**

Use one frozen synthetic companion prompt for each phase:

1. **Off:** confirm AIRI Context Flow contains no confirmed-preference text and
   experience the baseline answer.
2. **On:** enable apply in Inspector, wait at most one poll interval plus
   transport latency, confirm exactly one adapter-owned context entry, and
   experience the answer.
3. **Replace:** change the explicit preference only if needed for protocol
   verification; confirm the same source bucket is replaced, not appended.
4. **Off again:** disable apply, confirm the preference text disappears; accept
   the documented blank bucket but no residual Guidance.
5. **Restart:** restart only the adapter and confirm no duplicate source bucket.

Do not copy the responses into the checked-in report.

**Step 6: Record honest protocol results**

Mark each fact PASS/FAIL:

- connect;
- locally write non-empty context;
- manually verify presence;
- replace same source bucket;
- locally write empty replacement;
- manually verify preference absence;
- restart without duplication;
- zero raw-content logging.

Any failure keeps the experiment outcome `NOT_EVALUATED` until repaired or
explicitly abandoned.

**Step 7: Ask for the human value decision**

The user selects exactly one:

- `PROMISING`;
- `UNCLEAR`;
- `NOT_USEFUL`.

Record the label and a short content-free rationale. Do not convert it into an
M1 result.

**Step 8: Run the final cheap gate**

```bash
corepack pnpm --filter @companion-preference/adapter-airi-experiment test
corepack pnpm --filter @companion-preference/adapter-airi-experiment typecheck
git diff --check
git status --short
```

Expected: PASS and only the intended report/document changes remain.

**Step 9: Commit**

```bash
git add docs/airi-confirmed-preference-experiment.md evals/reports/airi-confirmed-preference-experiment-v1.json
git commit -m "test: record AIRI confirmed-preference experiment"
```

If the optional JSON report is not created, omit that path from `git add`.

## Completion conditions

The implementation milestone is complete only when:

- the package is private and default-off;
- the exact reviewed AIRI SDK version is pinned;
- default production source contains no chat-complete subscription;
- observation and learning remain disabled throughout setup and smoke;
- only canonical effective Guidance is projected;
- local write and manual verification remain distinct states;
- off/on/off and restart semantics are observed in real AIRI;
- no raw conversation, Guidance, preference value, or model output is written
  to logs/reports;
- the user records `PROMISING`, `UNCLEAR`, or `NOT_USEFUL`;
- `docs/important-todos.md` still marks the M1 quality gate as deferred and
  blocking before production/default-on/automatic learning.

Do not begin a production AIRI adapter, MCP work, or model-quality remediation
as part of this plan.
