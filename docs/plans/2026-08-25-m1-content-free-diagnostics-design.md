# M1 Content-Free Evaluation Diagnostics Design

**Status:** approved for implementation

## Purpose

The existing M1 smoke report exposes aggregate metrics only. It can show that
false negatives occurred, but cannot identify their synthetic evaluation case
IDs without another expensive model run. This slice adds persistent,
content-free outcome records so a completed run can be diagnosed without
storing prompts, conversations, expected preferences, model candidates, or
guidance content.

## Scope

Each new report records one outcome per evaluated item:

- quality cases use the existing stable evaluation case ID;
- background turns use their existing stable source reference;
- each record contains only an ID, item kind, and status.

Quality statuses are:

- `matched`: the prediction exactly satisfies the evaluated expectation;
- `missed`: expected candidate or guidance behavior was absent;
- `unexpected`: output was emitted where none was expected;
- `mixed`: both missing and unexpected behavior occurred;
- `execution-error`: no valid model result was available.

Background statuses are `clear`, `candidate-emitted`, or `execution-error`.

The report must not store raw turns, prompts, expected candidates, predicted
candidates, guidance values, model text, secrets, or error details.

## Versioning

New runner output becomes report schema version 2. The checked-in M1 smoke
report remains its historical v1 artifact because its per-case outcomes were
not retained; no inferred or fabricated diagnostics will be added to it.

## Data flow

1. The evaluation runner receives a parsed prediction or an execution failure.
2. Local deterministic comparison derives an outcome status.
3. The runner passes outcomes to the report builder.
4. The JSON report persists the outcomes alongside aggregate metrics.
5. Markdown remains aggregate-first and includes a compact count by status.

The model never decides the status itself. Execution failures remain distinct
from abstentions and from a `missed` outcome.

## Verification

- Unit tests cover every quality and background status without model calls.
- Report tests verify schema v2, status counts, and the absence of content
  fields.
- A single acknowledged 12-quality/20-background smoke run is performed only
  after implementation to identify the two existing false-negative case IDs.

