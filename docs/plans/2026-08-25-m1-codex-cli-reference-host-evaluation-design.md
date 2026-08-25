# M1 Codex CLI Reference Host and Evaluation Design

**Status:** high-tier freeze for review; implementation has not started.

## Outcome

M1 adds two proofs without changing the canonical Runtime:

1. a small terminal chat host closes the preference loop against the existing
   Runtime; and
2. a reproducible evaluation runner measures candidate quality with an
   explicitly selected model through the locally installed Codex CLI.

The reference host is a client, not a second preference engine. The Runtime
remains the sole owner of evidence, candidates, confirmed preferences, policy,
and SQLite state.

## Closed-loop sequence

For each completed chat turn, the reference host performs this order:

```text
current user message
  -> RuntimeClient.getEffectiveProfile(query)
  -> render the returned BehaviorGuidance only
  -> CodexCliChatClient.complete(current conversation + guidance)
  -> print assistant response
  -> RuntimeClient.ingestEvidence(current user text + assistant text)
```

Profile lookup is best effort. If it fails, chat continues without guidance.
Evidence ingestion is also best effort. If it fails after a successful model
response, the response is still returned. A failed model call does not create
evidence because there is no completed user/assistant pair.

The host uses configured, stable `userId`, `companionId`, `relationshipId`, and
`hostId`. It generates one session ID per process and one source reference per
completed turn. The model credential, generated developer message, Runtime
token, tool traces, terminal content, and prior unconsented history are never
placed in `InteractionEvidence`.

## Guidance projection

`BehaviorGuidance` is rendered by a pure, allowlist-only function. It accepts
only the seven existing structured fields and `avoid`; it does not accept
preference records, evidence, explanations, prompts, or arbitrary strings.
Fields are emitted in a stable order so tests and audits can compare output.
An empty profile produces no developer message.

The renderer describes response behavior, not user facts. It therefore cannot
turn a stored preference into a claim about the user or silently broaden its
scope.

## Codex CLI boundary

Codex CLI replaces the OpenAI-compatible HTTP model call described in the
original Task 13/14 plan. This is a transport change only.

The production adapter launches the `codex` executable directly without a
shell, sends the prompt through stdin, and requires an explicit model ID. It
uses the equivalent of:

```text
codex exec
  --ephemeral
  --ignore-user-config
  --ignore-rules
  --sandbox read-only
  --skip-git-repo-check
  --model <explicit-model-id>
  --output-schema <task-specific-schema>
  --output-last-message <temporary-output-file>
  -
```

Each run uses a newly created empty temporary working directory. This prevents
repository instructions, MCP configuration, project files, and normal Codex
session state from becoming hidden evaluation inputs. `--ephemeral` avoids a
persistent conversation. The runner has a bounded timeout and output-size
limit, rejects malformed structured output, and exposes only content-free
diagnostics. Prompts, Runtime tokens, provider credentials, and raw model
output are not logged.

“Local Codex CLI” means local process orchestration; the selected Codex model
may still require the configured OpenAI service and network. M1 must not claim
offline inference.

All automated tests inject a fake process runner and never invoke a real model.
The real model gate is a separate explicit command and is never part of the
default test suite.

## Reference-host boundaries

The host has three injected ports:

- `PreferenceRuntimePort`: effective-profile query and evidence ingestion;
- `ChatModelPort`: one chat completion returning assistant text;
- `ClockAndIds`: timestamps and stable testable IDs.

The orchestration layer depends on these ports rather than spawning Codex or
using HTTP directly. The terminal entry point wires them to `RuntimeClient`,
`CodexCliChatClient`, and production time/ID providers.

Only the current completed turn is sent as evidence. Conversation history may
be supplied to the chat model for continuity, but it is not automatically
submitted to preference learning. The initial M1 host accepts ordinary text
only; code, terminal, and tool-trace collection remain denied.

## Evaluation gate

The M1 evaluation remains two separate datasets:

- quality: at least 75 reviewed cases across the five frozen categories;
- background: at least 100 sequential ordinary turns with no gold preference
  change, used only for unnecessary-candidate burden.

The quality composition is frozen as:

- at least 15 explicit or repeated work preferences;
- at least 10 temporary states;
- at least 10 conflicts or changes;
- at least 10 ambiguous abstentions;
- at least 15 reviewed cross-domain counterfactual pairs (30 cases).

This resolves an ambiguity in the original roadmap: “15 pairs” means 15
two-case pairs, not 15 unpaired cases. The four other minima total 45, so the
strict minimum quality set is 75 cases. The roadmap's “at least 60” remains a
lower bound but is superseded by its more specific category requirements.

The binding gates are unchanged:

- precision `>= 0.80`;
- conflict/change accuracy `>= 0.85`;
- deterministic cross-domain leakage `== 0`;
- unnecessary pending candidates `<= 1` per 20 background turns.

Recall and abstention accuracy are reported but do not override a failed
binding gate. The model run records the explicit Codex model ID, CLI version,
prompt/schema version, generation budget, dataset manifest/hash, baseline
versions, start/end timestamps, and aggregate metrics. It does not store raw
private conversations.

The baseline matrix remains no-personalization, manual profile, plain memory,
semantic Memory/RAG, and full history. Compared systems receive the same
consented inputs and budget. Model output is parsed into the existing
`CandidateEvaluationPrediction` shape before scoring.

## Blinded export

M1 can export paired response artifacts with deterministic seeded label
randomization. The mapping is stored separately from the reviewer-facing file.
The export contains synthetic/anonymized scenario IDs and responses only.
Codex is not used as the sole judge of its own responses. Human preference
results remain an M4 gate.

## Failure semantics

- Runtime unavailable before completion: proceed without guidance.
- Runtime unavailable after completion: preserve the assistant response and
  report a content-free warning.
- Codex missing, unauthenticated, timed out, or invalid: fail that model call;
  do not ingest incomplete evidence.
- Invalid structured evaluation output: mark the case as an execution error;
  never coerce it into an abstention.
- Any binding threshold failure: M1 fails and Task 15 does not start.

## Explicit exclusions

This slice does not add AIRI integration, MCP, proactive behavior, relationship
state, identity portability, reflection, long-term memory retrieval, cloud
sync, or autonomous tools. It proves governed preference learning and
application in one host only.
