# Companion Preference Engine Agent Routing

## Purpose

This document turns the implementation plan into a mandatory two-tier execution protocol.

```text
high = gpt-5.6-sol / high
low  = gpt-5.6-luna / low
```

`Light` is the user-facing name for the low tier; the supported reasoning-effort value passed to the agent runtime is `low`.

The split is based on uncertainty and blast radius, not frontend versus backend. The high tier owns decisions that can silently change product meaning, security, privacy, persistence, protocol semantics, or evaluation conclusions. The low tier implements only frozen behavior that tests can decide mechanically.

No business-code task starts merely because it appears in the implementation plan. Its high-tier freeze packet must exist first.

## Mandatory workflow

Every delegated package follows:

```text
H-freeze
→ L-implement
→ H-verify
→ root integrates
→ milestone/user checkpoint
```

### H-freeze

A high-tier agent must provide:

- the exact base commit;
- SHA-256 hashes of the design, implementation, and routing plans;
- goal and non-goals;
- allowed and forbidden files;
- frozen public types, function signatures, error codes, state transitions, and routes;
- failing oracle tests and exact commands;
- privacy/data/network constraints;
- acceptance conditions and escalation triggers.

If the plan or its hash changes, the package is stale and the low-tier agent stops.

### L-implement

A low-tier agent:

- edits only allowed files;
- implements the minimum behavior required by frozen tests;
- does not change tests, public contracts, gold labels, thresholds, dependencies, or scope;
- does not commit, push, open a PR, call a real model, or modify the AIRI repository;
- returns changed files, implementation summary, commands/results, assumptions, and `git diff --check` output.

If the tests cannot pass inside the allowed files, the low-tier agent escalates instead of broadening the task.

### H-verify

A fresh high-tier reviewer, preferably not the freeze author:

- reviews the full diff against the frozen packet;
- reruns focused tests and relevant package checks;
- checks negative/privacy/failure paths, not only the happy path;
- verifies no contract, threshold, data policy, or dependency changed;
- returns `PASS`, `FIX`, or `REPLAN` with evidence.

Only root integrates a `PASS`. Milestone Gates are never signed by the low tier.

## Task routing matrix

| Task | Route | High-tier-owned work | Low-tier-owned work after freeze |
| --- | --- | --- | --- |
| 1. Workspace | H → L → H | Freeze Node/pnpm and secure dependency versions; lockfile rules | Workspace/config/script/README scaffolding |
| 2. Contracts | H → L → H | Identity, three policies, separate candidate/preference states, DTOs, provenance, receipts, negative tests | Valibot schema/fixture/export implementation |
| 3. Lifecycle | H → L → H | Transition matrix, actor authority, illegal transitions, action replay oracle | Pure lifecycle functions only |
| 4. Resolver | H → L → H | Scope/authority/privacy/conflict/expiry truth table | Resolver and explanation pure functions |
| 5. Repository port | H → L → H | Port, atomic boundaries, fencing, receipts, audit, delete graph, failure-injection suite | In-memory repository implementation |
| 6. M0 evaluation | H → L → H | Dev/held-out split, external high-tier-only gold labels/hashes, metrics, strong Memory/RAG baseline definition, M0 signature | Fake Observer, development loaders, metric/report plumbing, baseline mechanics without label access |
| 7. Real Observer | H → L → H | Outbound authorization, SSRF/redirect rules, redaction, revocation fences, adversarial tests | Prompt/transport code against frozen helpers and mocked fetch |
| 8. SQLite | H → L → H | Schema/migration, sync transaction oracle, WAL/secure-delete policy, receipts/fencing/delete tests | SQLite repository and migration implementation |
| 9. Runtime | H → L → H | Crash matrix, policy revision fences, single-writer lock, reset admission/lifecycle tests | Application/processor/lock code only against frozen ports |
| 10. HTTP/client | H → L → H | Secure dependency pin, DTOs, auth/CORS, action/revision, reset and conditional polling tests | Hono handlers and typed runtime client |
| 11. Connections UI | H → L → H | Consent copy, connection/projection state meanings, misleading-state prohibitions | Inspector shell and Connections UI |
| 12. Pending/Profile UI | H → L → H | Edit/confirm/suppress/delete/revise/revoke commands, 409 and non-optimistic semantics | Pending, CandidateCard, and Profile UI |
| 13. Reference host | H → L → H | Evidence allowlist, Guidance rendering contract, failure degradation, closed-loop acceptance | CLI host and frozen transports |
| 14. Model Gate | H → L → H (H owns Gate) | Gold review, model/parameters/budget, baseline fairness, sealed run, result interpretation, M1 decision | Runner/report/blind-export plumbing only |
| 15. AIRI | H spike → L → H | Protocol spike and Go decision; privacy, projection, tombstone, reconnect and real smoke acceptance | Adapter mapping/transport/render/Sidecar only after spike passes |
| 16. MCP | H → L → H | Principal/capability, pending-only proposal governance, schema dialect, spoof/no-bypass tests | Canonical-runtime stdio glue |
| 17. Acceptance | H → L → H (H owns Gate) | E2E oracles, destructive reset, real two-host run, engineering/product Go/No-Go | DataPage, fixtures, evidence-backed operations docs |

Task 13 is the first host-neutral closed loop. Two-host reuse is not claimed until Task 15 passes against real AIRI.

## Packages that the low tier may receive

Low-tier packages should normally be smaller than a plan Task. Examples:

- `T3A`: implement `lifecycle.ts` after the high tier freezes tests and exported signatures;
- `T4A`: implement `resolver.ts` from the approved truth table;
- `T4B`: implement `explain.ts` from approved reason codes;
- `T5A`: implement only `in-memory-repository.ts` against the shared contract suite;
- `T6A`: implement Fake Observer;
- `T6B`: implement loader and deterministic metric plumbing;
- `T6C`: implement already-defined baseline mechanics;
- `T10A`: implement the typed runtime client from frozen DTOs/routes;
- `T11A`, `T12A`, `T12B`: implement the three Inspector UI slices;
- `T13A`: implement structured Guidance rendering;
- `T14A`: implement deterministic report formatting;
- `T16A`: implement MCP-to-runtime delegation after principal/capability freeze;
- `T17A`: implement Data & History UI after destructive-action tests exist.

The following are not standalone low-tier packages:

- public contract or Repository-port design;
- Observer network/security policy;
- SQLite transaction/migration semantics;
- processor fencing, database locking, or reset lifecycle;
- HTTP authentication and destructive admission design;
- evaluation gold labels, thresholds, or Gate interpretation;
- AIRI protocol conclusions and real smoke-test judgment;
- MCP identity/capability policy;
- final Engineering or Product Go/No-Go.

## Mandatory high-tier oracles

The high tier writes or approves these before implementation:

- unconfirmed and conflicted preferences never affect Guidance;
- collection, outbound inference, and projection policies cannot enable one another;
- event snapshots cannot elevate canonical settings;
- cross-domain deterministic leakage is zero;
- stale evidence claims and stale policy revisions cannot commit;
- repeated action IDs are idempotent and payload mismatch conflicts;
- settings revocation cancels queued/in-flight outbound inference and rejects late results;
- SQLite failure injection leaves state, audit, and receipt all-or-nothing;
- path aliases/symlinks cannot start a second writer;
- reset rejects all DB-backed operations, keeps the process lock, deletes only canonical DB artifacts, and fails closed if recreation fails;
- HTTP never binds publicly by default and never leaks token/private response bodies;
- Inspector never displays a local AIRI socket write as verified application/clearing;
- MCP cannot spoof identity, cross scope, directly activate a preference, or passively observe turns;
- AIRI Sidecar → runtime never forwards rich model input;
- sealed evaluation data, model/settings, budgets, and baselines are reproducible.

## Milestone signatures

### M0

The high tier signs only after contracts test/typecheck, lifecycle/resolver truth tables, in-memory atomic/fencing tests, dataset hashes, and reproducible baseline plumbing pass.

### M1

The high tier signs only after Observer outbound-policy tests, SQLite shared contracts, crash/replay and single-writer tests, API security, non-optimistic UI, reference-host closed loop, and the sealed model report pass the implementation thresholds.

### M2

The high tier personally verifies the pinned AIRI runtime and SDK, AIRI repository unchanged, default-off collection, local-only unclassified chat inference, stable Sidecar identity, bounded runtime revision polling, rich-input filtering, and local-write versus next-turn verification states.

### M3

The high tier signs only after MCP uses a fixed principal/capability, owns no database/job/passive observer, routes every operation through the canonical runtime, and cannot directly mutate the Active Profile.

### M4

The high tier signs Engineering acceptance after crash, privacy, exact deletion/reset, two-host, export, and stop-projection checks. Product Go is separate and requires the pre-registered blind/user thresholds in the implementation plan; missing human evidence is `NOT_EVALUATED`, not Go.

## Immediate escalation conditions

The low tier stops and returns control to the high tier when any of these occurs:

- a public schema, route, port, state, scope, authority, revision, or receipt must change;
- a test seems passable only by weakening/removing it;
- a gold label, baseline, prompt, model setting, metric, or threshold needs adjustment;
- a low-tier agent receives or can access external held-out labels rather than only hashed/unlabeled inputs;
- raw content, remote network, token, logging, or projection identity is involved beyond the frozen path;
- migration, transaction, DB path, symlink, lock, deletion, or reset semantics are touched;
- a pinned AIRI fact differs from the protocol spike;
- an MCP caller can supply or override identity/capability;
- deterministic governance/privacy tests fail or leakage is non-zero;
- a dependency or lockfile changes, has a high advisory, or lacks the required Node/native support;
- the base commit or any frozen plan hash changes.

## Task packet template

```text
Package ID:
Tier/model: gpt-5.6-luna / low
Base commit:
Plan hashes:
Goal:
Non-goals:
Allowed files:
Forbidden files:
Frozen signatures/states/routes:
Red tests already present:
Commands to run:
Acceptance conditions:
Escalation conditions:
Required handoff evidence:
Commit/push permission: none
```

## First execution sequence

1. The high tier performs Task 1 dependency/version preflight and emits `T1A`.
2. The low tier implements `T1A` without committing.
3. A fresh high-tier agent verifies the diff and commands.
4. Root presents the first implementation diff/checkpoint.
5. The high tier freezes Task 2 contracts and oracle tests.
6. The low tier receives only the mechanical schema implementation package.
7. Repeat through M0; do not schedule M1 work before the high tier signs M0.

This routing remains in force unless the user explicitly changes model tiers or review policy.
