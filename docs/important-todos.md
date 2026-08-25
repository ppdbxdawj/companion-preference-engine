# Important follow-ups

This file records deferred work that must not be mistaken for completed or
irrelevant work.

## Production preference-quality gate

**Status:** deferred during the AIRI value experiment; blocking before any
default-on or automatic-learning release.

The repaired M1 smoke run in
`evals/reports/m1-smoke-cross-domain-v3.json` did not pass the binding model
gate:

- precision: `0.6666666666666666`, below the `0.80` minimum;
- deterministic cross-domain leakage: `2`, above the required `0`;
- recall: `1`, which does not compensate for speculative candidates or
  cross-domain guidance.

Do not describe M1 as passed. The failure is temporarily non-blocking only for
an isolated AIRI experiment that disables automatic observation and learning,
uses a manually selected explicit companion preference, and does not ship as a
production adapter.

Revisit this gate before any of the following:

- enabling automatic preference extraction in AIRI;
- enabling projection by default;
- calling the AIRI adapter production-ready;
- using learned preferences without explicit user confirmation;
- beginning an end-to-end acceptance milestone that depends on model quality.

The follow-up must determine whether the remaining errors come from prompt
semantics, model behavior, scoring semantics, or a missing deterministic domain
boundary. Any fix must be evaluated against a new versioned report rather than
rewriting the failed report.
