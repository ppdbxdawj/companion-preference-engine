# AIRI Confirmed-Preference Experiment Design

**Status:** approved for planning on 2026-08-25

## Goal

Determine whether a user-confirmed companion preference creates a noticeable,
valuable change in AIRI before investing further in automatic preference
extraction or a production adapter.

This is a product-value and protocol experiment. It is not an M1 pass, a
production AIRI integration, or evidence that automatic learning is safe.

## Decision context

The repaired M1 smoke run reached recall `1` but failed the binding precision
and cross-domain leakage thresholds. Those failures remain important production
follow-ups in [`docs/important-todos.md`](../important-todos.md), but they do not
affect an experiment that never asks a model to infer a preference.

The AIRI protocol facts were rechecked against official `main` commit
`d5742dbb7`. The experiment targets the exact published
`@proj-airi/server-sdk@0.12.0-beta.1` release. AIRI still publishes
`output:gen-ai:chat:complete` with rich composed input and accepts
`context:update` updates with `replace-self` semantics. The rich completion
event is not required by the default experiment path.

## Considered approaches

### Protocol marker only

Send an inert marker through `context:update`. This cheaply proves connectivity
but cannot show whether confirmed preferences improve the companion experience.

### Manually confirmed preference projection — selected

Create one explicit companion preference through the canonical Runtime, project
the resulting Guidance into AIRI, and compare the same scenario with application
off, on, then off again. This isolates preference value from the deferred model
quality problem.

### Automatic closed loop

Observe AIRI conversations, infer candidates, confirm them, and project them
back. This is closest to the eventual product but would mix the experiment with
known model errors and AIRI's current rich-event privacy limitation. It is
deferred.

## Scope

The experiment uses one fixed synthetic profile identity, host `airi`, domain
`companion`, and one explicit `companion.support_style` preference selected by
the user from the canonical vocabulary:

- `listen_first`;
- `acknowledge_then_act`;
- `direct_action`.

Automatic observation, automatic learning, evidence ingestion, candidate
generation, and background model calls remain disabled. The adapter never reads
the SQLite database directly and never constructs independent preference state.

The implementation lives in this repository as a private package clearly
labelled experimental. It does not modify or fork AIRI business code.

## Architecture

The experiment contains four small responsibilities:

1. **AIRI transport** wraps the exact Server SDK version, owns a stable module
   identity, connects to AIRI, and publishes `context:update` messages.
2. **Projection controller** reads the effective profile through the existing
   typed Runtime client and publishes only when the effective Guidance or
   settings revision changes.
3. **Demo setup** creates one explicit user-authorized companion preference
   through the Runtime API. It does not insert database rows or simulate model
   evidence.
4. **Protocol report** records versions, content-free connection and projection
   outcomes, known limitations, and the user's final experience decision.

The existing reference-host Guidance renderer remains the single renderer. The
AIRI experiment must reuse or extract that implementation rather than introduce
a second interpretation of `BehaviorGuidance`.

## Data flow

```text
manual support-style selection
  -> Runtime create-explicit-preference command
  -> Runtime effective-profile query for host=airi, domain=companion
  -> existing BehaviorGuidance renderer
  -> AIRI context:update with replace-self
  -> AIRI composes the next turn with the confirmed guidance
```

The canonical Runtime remains the authority. Its `applyEnabled` setting and
projection host/domain allowlists must both permit the query before any Guidance
is returned. Empty Guidance produces no preference text.

The transport uses a stable source identity so every update replaces the
adapter's own context bucket. It must not claim that `contextId` selects the
replacement bucket.

## Controls and privacy boundary

The experimental process is disabled by default and requires an explicit local
enable flag. Runtime governance remains a second, independent gate.

The default path does not subscribe to `output:gen-ai:chat:complete`, because
that event currently exposes `composedMessage`, contexts, and input before an
adapter can filter them. Presence and removal are verified manually through
AIRI DevTools using synthetic test prompts.

If a later diagnostic mode observes a completion event, it must be separately
enabled, accept synthetic test turns only, retain no event or text, emit no raw
logs, and reduce the observation immediately to a content-free boolean or hash.
That mode is not required for this experiment.

Logs and reports may contain only versions, timestamps, identities, settings
revisions, hashes, connection states, delivery states, and user-entered outcome
labels. They must not contain conversation text, rendered Guidance, raw
preferences, composed prompts, contexts, tools, or model output.

## Projection and removal semantics

For non-empty Guidance, the adapter publishes a concise confirmed-preference
block using `replace-self`. A successful SDK send proves only that a connected
local WebSocket write completed. It is recorded as locally written until the
user verifies the AIRI Context Flow view.

When application is disabled or the effective Guidance becomes empty, the
adapter publishes an empty replacement. AIRI currently leaves a blank source
bucket rather than deleting it. The experiment succeeds if the confirmed
preference text is absent; it must not claim that the bucket itself was removed.

## Failure behavior

- If Runtime is unavailable, publish nothing and let AIRI continue without
  personalization.
- If AIRI is unavailable, retain no new profile state, use bounded reconnect
  backoff, and do not block Runtime.
- If settings change during a read or write, re-read the canonical profile
  instead of applying stale permissions.
- If Guidance cannot be rendered, publish nothing and report a content-free
  error.
- If a local write succeeds but AIRI adoption is unverified, show
  `locally-written`; never promote it to verified automatically.
- On shutdown after a non-empty projection, attempt one bounded empty
  replacement and report honestly if it cannot be written.

## Verification

### Automated tests

Use fake Runtime and AIRI transports to prove:

- only canonical, confirmed effective Guidance can be projected;
- disabled application, disallowed host/domain, or empty Guidance yields no
  preference text;
- a change publishes once and an unchanged profile does not republish;
- disabling application publishes an empty replacement;
- stable identity and `replace-self` are used;
- Runtime or AIRI failure degrades to unpersonalized AIRI;
- logs and reports contain no restricted content;
- the package does not subscribe to rich completion events in default mode.

### Local protocol smoke

Run the current AIRI checkout, the canonical local Runtime, and the experimental
adapter. Verify in AIRI DevTools that:

1. application off has no confirmed-preference text;
2. application on creates exactly one adapter-owned context entry;
3. a revision replaces rather than appends the entry;
4. application off removes the preference text, while the documented blank
   bucket may remain;
5. restart re-establishes the same source bucket without duplication.

### Human value checkpoint

The user experiences the same synthetic companion scenario with application
off, on, then off again and records one result:

- `PROMISING`: the confirmed preference noticeably improves fit;
- `UNCLEAR`: a difference exists but its value is not established;
- `NOT_USEFUL`: no meaningful improvement or a worse experience.

No automatic metric may substitute for this decision.

## Exit decisions

- `PROMISING`: plan the production AIRI adapter. Resolve the deferred M1 quality
  TODO before enabling automatic learning or default-on projection.
- `UNCLEAR`: test one different support style or companion scenario without
  expanding the architecture.
- `NOT_USEFUL`: stop AIRI projection work and leave automatic-learning quality
  remediation deferred until another host demonstrates the need.

The experiment may prove that confirmed preference projection is valuable. It
cannot prove automatic preference inference, source-side privacy, multi-user or
multi-character identity, production delivery acknowledgement, or long-term
companion quality.
