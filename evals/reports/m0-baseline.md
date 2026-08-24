# M0 deterministic baseline report

Status: **deterministic implementation complete**

This report is deliberately limited to the consent-safe synthetic Task 6
fixtures. It contains no private conversation data and makes no claim that the
Preference Engine improves real user outcomes.

## Frozen comparison

| Baseline | Candidate governance | Frozen expectation before implementation |
| --- | --- | --- |
| No personalization | No | No candidates and no guidance |
| Plain memory | No | Unconstrained fact extraction plus lexical retrieval |
| Semantic Memory/RAG | No | Same consented window, backbone, retrieval budget, and generation budget as the engine |
| Manual profile | User-authored only | Projects only the supplied gold manual profile; approximate upper bound |

The executable baselines are deterministic and have no network or persistence
side effects. The no-personalization baseline produces zero candidates and
zero guidance for all 30 development cases. The plain-memory fixture run
produces the following reproducible aggregate (30 cases, 37 user turns):

| Baseline | TP | FP | FN | Precision | Recall | Abstention accuracy | Conflict/change accuracy | Cross-domain leakage | Candidates / 20 turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No personalization | 0 | 0 | 22 | 0 | 0 | 1 | 0 | 0 | 0 |
| Plain memory | 21 | 14 | 1 | 0.6 | 0.9545454545 | 0 | 0 | 6 | 18.9189189189 |

Semantic Memory/RAG is intentionally an injected-backbone adapter, so its
model-dependent aggregate is not claimed here. Manual profile is likewise
scored only when a caller supplies a profile.

## Metrics

The deterministic runner must report exact candidate precision and recall,
abstention accuracy, conflict/change accuracy, cross-domain leakage count, and
candidates per 20 user turns. The M0 release gate requires zero cross-domain
guidance leakage. Real-model thresholds remain intentionally unset until Task
14; retroactively changing v1 labels to improve a prompt is forbidden.

## Known limitations

- All committed conversations are synthetic and English-only.
- M0 evaluates contract behavior, privacy isolation, and deterministic scoring;
  it does not establish emotional quality or long-term companion value.
- Held-out labels are committed only by SHA-256 and remain outside the shared
  workspace.
- Plain lexical memory is intentionally weak; the semantic Memory/RAG baseline
  is the meaningful model-backed comparison once a real model is configured.
