# Task 6 low-tier implementation packet

Branch: `feat/m0-evaluation-foundation`

The high tier has frozen Task 6 public contracts, synthetic inputs, manifest
commitments, and deterministic test oracles. The low tier may implement only
the TODO bodies in the files listed below and update `pnpm-lock.yaml` as needed.
Do not change schemas, fixtures, expected values, dataset labels, hashes, or the
baseline interfaces. Do not add network or model code.

## Allowed implementation files

- `packages/observer/src/fake-observer.ts`
- `evals/src/load.ts`
- `evals/src/candidate-eval.ts`
- `evals/src/baselines/no-personalization.ts`
- `evals/src/baselines/plain-memory.ts`
- `evals/src/baselines/semantic-memory-rag.ts`
- `evals/src/baselines/manual-profile.ts`
- `evals/reports/m0-baseline.md` (fill deterministic results only)
- `pnpm-lock.yaml`

## Required semantics

1. Fake Observer returns deep defensive copies of only its constructor-supplied
   pending proposals, fails with an `AbortError` if aborted, and performs no I/O.
2. JSONL loaders reject blank lines, malformed JSON, unknown fields, invalid
   schemas, and duplicate case IDs. `data:` URLs are supported for test-only
   invalid inputs. Manifest verification resolves dataset paths relative to the
   manifest and hashes exact bytes with SHA-256 before checking parsed counts.
3. Candidate matching is a multiset comparison using canonical JSON of
   `{ preference, scope }`; duplicate predictions are false positives. Require
   exactly one prediction for every known case and reject unknown/duplicate IDs.
4. Zero-denominator rates are `1` only when the corresponding population is
   empty and no error exists. `candidatesPer20Turns` counts user turns only.
5. Abstention is correct only when both expected and predicted candidate lists
   are empty. Conflict/change accuracy is exact candidate-set plus exact-guidance
   equality for that category.
6. Cross-domain leakage counts every unexpected defined guidance field on a
   cross-domain case. Candidate extraction is scored separately and is not
   itself leakage.
7. No-personalization returns empty output. Manual profile returns only the
   supplied profile. Semantic Memory/RAG passes the exact input budget and
   consented turn window to its injected backbone and checks abort before work.
   Plain memory is deterministic lexical-only and creates no governed state.

## Gate

Run the five Task 6 commands from the parent plan. Stop after the complete M0
gate passes; do not write a real Observer prompt. Report any apparent oracle
defect to the high tier instead of editing expected data.
