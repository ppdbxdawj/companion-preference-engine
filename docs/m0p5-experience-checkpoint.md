# M0.5 Experience Checkpoint

Date: 2026-08-24

## Scope

This was a deterministic, local terminal walkthrough over synthetic data. It
used a Fake Observer and in-memory state only: no model, network, persistence,
HTTP, MCP, AIRI adapter, or real conversation data participated.

## Recorded walkthrough

1. A synthetic work-domain statement produced a visible candidate for
   `interaction.response_detail = concise`.
2. Before confirmation, the terminal showed a labeled deterministic baseline
   preview.
3. The user confirmed the candidate. Work-domain guidance became
   `responseDetail=concise`, the preview changed to its concise template, and
   the same preference was excluded from the companion domain with
   `privacy-domain-mismatch`.
4. The user also exercised revocation in an earlier walkthrough. Guidance then
   became empty with `inactive-status` and the preview returned to baseline.
5. In the final walkthrough, the user exited after confirmation. The terminal
   held no state after exit.

## User assessment

| Question | Recorded result |
| --- | --- |
| Candidate understandable | Yes; the work/companion domain distinction was clarified during the walkthrough. |
| Behavior change perceptible | Yes; baseline and concise deterministic previews were distinguishable. |
| Confirm/revoke intuitive | Yes; confirmation was exercised in the final walkthrough and revocation in an earlier walkthrough. |
| Distinct from ordinary memory | Yes; the user accepted the explicit confirmation and scoped-application model. |

## Decision

Status: CONTINUE

The user selected `CONTINUE` after the walkthrough. This unlocks Task 7's
consent-gated, OpenAI-compatible Observer work. It is not evidence of real
model quality, persistence, cross-host reuse, or AIRI compatibility.
