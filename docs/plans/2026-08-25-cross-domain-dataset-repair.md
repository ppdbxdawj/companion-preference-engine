# Cross-Domain Evaluation Dataset Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the underdetermined cross-domain development dataset with 15 explicit counterfactual pairs while preserving the 30-case shape and evaluation thresholds.

**Architecture:** Add a new `cross-domain-v2.jsonl` with identical work/companion turns per pair and explicit work preference language. Publish `manifest-v3.json` using the existing manifest schema (schemaVersion remains 2) and point only the development cross-domain entry at the new file. Add deterministic contract checks for unique pair text and non-empty work gold labels.

**Tech Stack:** JSONL, TypeScript, Vitest, SHA-256, tsx, Codex CLI smoke runner.

---

### Task 1: Freeze the repaired dataset contract with failing tests

**Files:**

- Modify: `evals/src/m1-dataset-contract.ts`
- Modify: `evals/src/m1-dataset-contract.test.ts`
- Modify: `evals/src/m1-dataset-load.test.ts`

**Step 1: Write failing tests**

Add an exported validator that accepts the cross-domain cases and rejects:

- two different pair IDs with the same normalized user-turn text;
- a work-side cross-domain case with no expected candidate;
- a pair whose two domains are not exactly work and companion.

Point a new loader test at `evals/datasets/manifest-v3.json` and `cross-domain-v2.jsonl`; it should initially fail because those files do not exist.

**Step 2: Run the focused tests**

Run:

```bash
pnpm --filter @companion-preference/evals test -- m1-dataset-contract.test.ts m1-dataset-load.test.ts
```

Expected: FAIL because the new validator/export and v2 dataset files are absent.

**Step 3: Implement the validator**

In `evals/src/m1-dataset-contract.ts`, add `validateCrossDomainDatasetQuality`:

- group by `counterfactualPairId`;
- normalize each pair's user turns by stable JSON of `{role,text}`;
- reject duplicate normalized text across pair IDs;
- require exactly one work and one companion case;
- require each work case to have at least one expected candidate;
- require each companion case to have zero expected candidates and forbid every work-side candidate key.

Return a content-free summary containing pair count and distinct-text count.

**Step 4: Run the focused tests**

Run the same command. Expected: synthetic validator tests pass; file-loading test still fails until Task 2.

**Step 5: Commit**

```bash
git add evals/src/m1-dataset-contract.ts evals/src/m1-dataset-contract.test.ts evals/src/m1-dataset-load.test.ts
git commit -m "test: enforce explicit cross-domain dataset pairs"
```

### Task 2: Add cross-domain-v2 and manifest-v3

**Files:**

- Create: `evals/datasets/cross-domain-v2.jsonl`
- Create: `evals/datasets/manifest-v3.json`
- Modify: `evals/src/m1-dataset-load.test.ts`

**Step 1: Add 15 explicit pairs**

Create 30 JSONL records. Each pair has the same turn object on work and companion cases, with only `queryContext.domain` changed.

Use 15 distinct user texts. Cover these target values:

- `work.approval_style`: `always_ask`, `risk_based`, `review_after`;
- `work.verification_depth`: `minimal`, `targeted`, `exhaustive`.

Example pair texts:

- “For consequential work changes, always ask me before acting.”
- “For low-risk work steps, proceed automatically but ask before risky ones.”
- “After you make a work change, show me the result for review.”
- “For this work task, use only minimal verification.”
- “For work tasks, use targeted verification.”
- “For work tasks, run exhaustive verification.”

Repeat preference values only with different explicit scenarios; never reuse normalized turn text across pair IDs.

For each pair, work expectedCandidates/guidance match the explicit target. Companion expectedCandidates/guidance remain empty, and forbiddenKeys contains the corresponding work preference key.

**Step 2: Create manifest-v3**

Copy `manifest-v2.json`, keep `schemaVersion: 2`, keep all non-cross-domain dataset entries and minimums unchanged, replace the cross-domain path with `cross-domain-v2.jsonl`, update its count to 30, and set a new `frozenAt`. Compute the new SHA-256 exactly from the committed JSONL bytes.

**Step 3: Run manifest and dataset tests**

Run:

```bash
pnpm --filter @companion-preference/evals test -- m1-dataset-load.test.ts m1-dataset-contract.test.ts
pnpm --filter @companion-preference/evals typecheck
```

Expected: repaired manifest verifies, all 75 quality cases and 100 background turns load, and the explicit-pair validator passes.

**Step 4: Commit the data version**

```bash
git add evals/datasets/cross-domain-v2.jsonl evals/datasets/manifest-v3.json evals/src/m1-dataset-load.test.ts
git commit -m "data: repair cross-domain evaluation pairs"
```

### Task 3: Run the repaired smoke and compare results

**Files:**

- Create: `evals/reports/m1-smoke-cross-domain-v3.json`
- Create: `evals/reports/m1-smoke-cross-domain-v3.md`

**Step 1: Run the acknowledged smoke**

Because the package command runs from `evals/`, pass explicit paths:

```bash
pnpm --filter @companion-preference/evals eval:model-gate -- \
  --smoke \
  --model gpt-5.6-terra \
  --allow-configured-remote \
  --manifest ../evals/datasets/manifest-v3.json \
  --output-json ../evals/reports/m1-smoke-cross-domain-v3.json \
  --output-markdown ../evals/reports/m1-smoke-cross-domain-v3.md
```

Expected: 12 quality calls and 20 background calls, no execution failures, and report metadata references the v3 manifest hash. This remains `SMOKE_ONLY`.

**Step 2: Inspect only content-free outcomes**

Compare quality statuses for the repaired cross-domain cases against the previous report. Confirm the work-side cases are no longer underdetermined and that companion cases remain abstentions. Do not add raw prompts or model output to reports or PR text.

**Step 3: Run final verification**

```bash
pnpm --filter @companion-preference/evals test
pnpm --filter @companion-preference/evals typecheck
git diff --check
```

Expected: all checks pass.

**Step 4: Commit the repaired smoke artifacts**

```bash
git add evals/reports/m1-smoke-cross-domain-v3.json evals/reports/m1-smoke-cross-domain-v3.md
git commit -m "eval: record repaired cross-domain smoke"
```

