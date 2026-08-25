# Cross-Domain Evaluation Dataset Repair Design

**Status:** approved for implementation planning

## Problem

The frozen cross-domain dataset contains 15 pairs whose work and companion cases share the same user turn text. The work-side gold labels alternate between different preferences even though no input field distinguishes those intents. This makes the work-side labels underdetermined and makes recall results unsuitable for judging the model.

## Decision

Keep the evaluation shape and cross-domain objective, but publish a new dataset manifest version with repaired, explicit pair inputs.

For every pair:

- work and companion cases keep identical turns;
- only `queryContext.domain` changes;
- the turn explicitly expresses one target work preference;
- the work case keeps the corresponding expected candidate and guidance;
- the companion case keeps empty expected candidates/guidance and forbids the work preference.

The repaired set remains 30 cases in 15 pairs. The evaluation thresholds and scoring code do not change.

## Coverage

Use distinct natural-language turns across the 15 pairs while covering the work approval and verification preference values:

- `work.approval_style`: `always_ask`, `risk_based`, `review_after`;
- `work.verification_depth`: `minimal`, `targeted`, `exhaustive`.

Repeated values may appear in different explicit scenarios, but no two pairs reuse the same turn text.

## Versioning and integrity

Do not edit `cross-domain-v1.jsonl` or `manifest-v2.json`. Add `cross-domain-v2.jsonl` and `manifest-v3.json`, updating only the cross-domain dataset path/hash and frozen timestamp while preserving all other dataset entries and minimums.

The old v1 artifacts remain available for historical comparison. New smoke reports must reference the v3 manifest hash.

## Verification

Add a dataset-contract test that fails if two cross-domain pairs have identical normalized turn text or if a work case has an empty expected candidate set. Recalculate the SHA-256 hash and run the existing manifest loader and composition checks. Then run one acknowledged 12-quality/20-background smoke using the v3 manifest.

Raw synthetic turns remain in the dataset by design, but smoke reports continue to store only IDs, statuses, and aggregate metrics.

