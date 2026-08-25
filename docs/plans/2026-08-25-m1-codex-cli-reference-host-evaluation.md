# M1 Codex CLI Reference Host and Evaluation Implementation Plan

> Execute only after the high-tier freeze is reviewed. Each implementation
> task stops for high-tier verification before commit.

**Goal:** Complete Tasks 13 and 14 using Codex CLI as the explicit model
transport while preserving the existing Runtime, privacy, and governance
contracts.

**Design:** See
`docs/plans/2026-08-25-m1-codex-cli-reference-host-evaluation-design.md`.

## Task 13A: Reference-host package and pure guidance rendering

Create the package manifest and TypeScript configuration under
`apps/reference-host`. Implement the frozen renderer tests first. Empty
guidance returns no developer message; populated guidance emits only known
structured fields in stable order.

Verification:

```bash
pnpm --filter @companion-preference/reference-host test
pnpm --filter @companion-preference/reference-host typecheck
```

## Task 13B: Closed-loop orchestration

Implement injected Runtime, model, clock, and ID ports. Make the frozen host
tests pass with these invariants:

1. effective profile is queried before every model call;
2. only rendered Guidance reaches the developer message;
3. a successful completion ingests only that user/assistant pair;
4. lookup and ingestion failures degrade independently;
5. model failure does not ingest evidence;
6. stable configured identity and generated session/turn IDs are used.

Use `RuntimeClient`; do not duplicate HTTP logic or own profile state.

## Task 13C: Isolated Codex CLI chat adapter and terminal entry point

Implement direct process spawning behind an injected executor. Freeze the
argument list, stdin transport, temporary working directory, JSON schema,
timeout, maximum output size, abort behavior, and redacted errors. No shell,
MCP, repository rules, user configuration, or implicit model ID is allowed.

Wire the terminal with `readline/promises`. Add a deterministic fake-process
smoke command; a real Codex call is opt-in and not run by automated tests.

## H-verify 13

Review the complete diff for evidence minimization and failure ordering. Run
focused tests, package typecheck/build, the deterministic smoke, then the full
workspace checks. Stop if the host sends more than the current completed turn
to the Runtime or silently uses a default model.

## Task 14A: Dataset schema v2 and reviewed data

Add a v2 manifest without editing v1. Freeze separate dataset kinds for
quality, background, and held-out input. Add validators for category minima,
counterfactual pairing, sequential background turns, immutable hashes, and
unique IDs across files.

The high tier authors/reviews the 75 quality cases (including 15 complete
cross-domain pairs) and 100 background turns.
Do not use private conversation history. Low-tier implementation may build
loaders and fixtures but may not change gold labels.

## Task 14B: Baselines and scoring

Add full-history to the baseline union. Keep a shared explicit budget and
backbone descriptor. Separate candidate-quality scoring from background
confirmation burden. Implement a gate decision object that reports every
metric and all failed binding thresholds; never short-circuit at the first
failure.

## Task 14C: Codex CLI evaluation runner

Reuse the frozen direct-process security semantics. Give each case an isolated
ephemeral invocation with an explicit model ID and output schema. Normalize
valid output into existing predictions. Track execution failures separately;
they are not abstentions and prevent a passing gate.

The real command requires explicit acknowledgement of outbound inference and
an explicit model ID. Automated tests use fixture output only.

## Task 14D: Aggregate report and blinded export

Generate a versioned machine-readable report plus Markdown summary containing
only run metadata, case IDs/statuses, and aggregate metrics. Add deterministic
seeded paired-response export and a separate concealed label map. Do not add
automated model judging.

## H-verify 14 / M1 stop

Run:

```bash
pnpm --filter @companion-preference/evals test
pnpm --filter @companion-preference/evals typecheck
pnpm --filter @companion-preference/evals eval:model-gate -- \
  --model <explicit-model-id> --allow-configured-remote
pnpm check
```

Record the CLI version and aggregate report. M1 passes only if the reference
host loop passes and every binding threshold passes. Stop for user review;
do not begin AIRI Task 15 automatically.
