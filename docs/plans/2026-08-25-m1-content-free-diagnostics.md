# M1 Content-Free Evaluation Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist content-free, per-item M1 evaluation outcomes so completed smoke runs identify missed synthetic case IDs without retaining prompts or model content.

**Architecture:** Add pure local outcome classifiers beside the existing deterministic scoring logic. The model-gate runner will collect these classifiers' content-free results and the report builder will emit schema v2 JSON plus aggregate status counts in Markdown. Historical v1 reports are not rewritten.

**Tech Stack:** TypeScript, Vitest, tsx, Codex CLI (one explicitly acknowledged smoke run only).

---

### Task 1: Add pure content-free outcome classification

**Files:**

- Modify: `evals/src/candidate-eval.ts`
- Test: `evals/src/candidate-eval.test.ts`

**Step 1: Write the failing tests**

Add examples proving that the exported classifier returns only the stable case ID and one of `matched`, `missed`, `unexpected`, or `mixed`:

```ts
expect(classifyQualityCaseOutcome(caseWithExpectedCandidate, emptyPrediction))
  .toEqual({ caseId: 'work-preference-1', kind: 'quality', status: 'missed' })
expect(classifyQualityCaseOutcome(caseWithNoExpectation, unexpectedPrediction))
  .toEqual({ caseId: 'ambiguous-1', kind: 'quality', status: 'unexpected' })
```

Include a case with both a missing expected candidate and an unexpected one; it must be `mixed`. Assert `JSON.stringify(outcome)` does not contain synthetic turn text, candidate preference keys, values, or guidance values.

**Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @companion-preference/evals test -- candidate-eval.test.ts`

Expected: FAIL because the classifier is not exported.

**Step 3: Implement the minimal classifier**

In `evals/src/candidate-eval.ts`, factor the existing canonical candidate and guidance comparison helpers so scoring and classification share equality semantics. Add:

```ts
export type QualityOutcomeStatus = 'matched' | 'missed' | 'unexpected' | 'mixed' | 'execution-error'
export type QualityCaseOutcome = Readonly<{
  caseId: string
  kind: 'quality'
  status: QualityOutcomeStatus
}>
```

`classifyQualityCaseOutcome` determines whether the prediction has a missing expected candidate/guidance field and/or an unexpected candidate/guidance field. It returns only ID, kind, and status.

**Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @companion-preference/evals test -- candidate-eval.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add evals/src/candidate-eval.ts evals/src/candidate-eval.test.ts
git commit -m "feat: classify content-free quality outcomes"
```

### Task 2: Extend the report contract to schema v2

**Files:**

- Modify: `evals/src/report.ts`
- Test: `evals/src/report.test.ts`

**Step 1: Write the failing tests**

Extend report fixtures with quality and background outcomes. Assert that a new report has `schemaVersion: 2`, preserves outcomes exactly, and includes only `itemId`, `kind`, and `status` for every outcome. Assert Markdown shows counts by status, not an outcome-by-outcome content dump.

**Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @companion-preference/evals test -- report.test.ts`

Expected: FAIL because v1 reports have no outcome field.

**Step 3: Implement schema v2**

Define a discriminated `EvaluationItemOutcome` union in `evals/src/report.ts`:

```ts
export type EvaluationItemOutcome = Readonly<{
  itemId: string
  kind: 'quality' | 'background'
  status: 'matched' | 'missed' | 'unexpected' | 'mixed' | 'execution-error' | 'clear' | 'candidate-emitted'
}>
```

Require the outcomes in `M1ReportInput`; reject blank IDs, invalid kind/status combinations, and duplicate `(kind, itemId)` pairs. Return report schema version 2 with the outcomes. Render only a status-count summary in Markdown. Do not modify `evals/reports/m1-smoke-gate.json` or its Markdown counterpart because they are retained historical v1 artifacts.

**Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @companion-preference/evals test -- report.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add evals/src/report.ts evals/src/report.test.ts
git commit -m "feat: emit content-free M1 report outcomes"
```

### Task 3: Collect outcomes in the model-gate runner

**Files:**

- Create: `evals/src/run-model-gate.test.ts`
- Modify: `evals/src/run-model-gate.ts`

**Step 1: Write failing runner tests**

Extract or inject the minimal runner seam needed to test report-input construction with deterministic fake quality predictions and background counts. Test that a quality false negative becomes `missed`; an execution error becomes `execution-error` while the aggregate failure count still increments; a background count of zero becomes `clear`; a positive count becomes `candidate-emitted`; and report outcomes contain no raw synthetic turn text.

**Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @companion-preference/evals test -- run-model-gate.test.ts`

Expected: FAIL because the runner does not collect outcomes.

**Step 3: Implement minimal collection**

In `runModelGate`, build one outcome for every selected quality case and background turn. For quality calls, classify the parsed prediction after a successful call; in the catch path emit `execution-error` rather than classifying the synthetic empty prediction. For background calls, map zero to `clear`, a positive count to `candidate-emitted`, and an error to `execution-error`. Pass the full outcome list to `createM1Report`.

Keep existing aggregate scoring and gate semantics unchanged: execution errors still prevent an M1 gate pass, and smoke reports still return `SMOKE_ONLY`.

**Step 4: Run focused and package checks**

Run:

```bash
pnpm --filter @companion-preference/evals test
pnpm --filter @companion-preference/evals typecheck
git diff --check
```

Expected: all commands succeed.

**Step 5: Commit**

```bash
git add evals/src/run-model-gate.ts evals/src/run-model-gate.test.ts
git commit -m "feat: record M1 model-gate outcomes"
```

### Task 4: Run the new smoke report and inspect the two misses

**Files:**

- Create: `evals/reports/m1-smoke-diagnostics-v2.json`
- Create: `evals/reports/m1-smoke-diagnostics-v2.md`

**Step 1: Confirm the smoke command has an explicit model and remote acknowledgement**

```bash
pnpm --filter @companion-preference/evals eval:model-gate -- \
  --smoke \
  --model gpt-5.6-terra \
  --allow-configured-remote \
  --output-json evals/reports/m1-smoke-diagnostics-v2.json \
  --output-markdown evals/reports/m1-smoke-diagnostics-v2.md
```

**Step 2: Run the command once**

Expected: 12 quality invocations and 20 background invocations, with no raw model content written to the report. This is not a formal M1 gate.

**Step 3: Inspect the content-free outcomes**

Read only outcome IDs/statuses and aggregate metrics. Identify each quality outcome whose status is `missed` or `mixed`, then compare the count against the report's false-negative total. Do not add raw evaluation content to a commit or PR description.

**Step 4: Run final verification**

```bash
pnpm --filter @companion-preference/evals test
pnpm --filter @companion-preference/evals typecheck
git diff --check
```

Expected: all commands succeed.

**Step 5: Commit the implementation and new v2 smoke artifacts**

```bash
git add evals docs/plans/2026-08-25-m1-content-free-diagnostics.md
git commit -m "feat: add content-free M1 diagnostics"
```

