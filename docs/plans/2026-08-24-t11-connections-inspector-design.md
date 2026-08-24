# T11 Connections Inspector Design

## Decision

T11 adds a browser Inspector that reads a real list of configured host
connections from the local runtime. It does not invent an AIRI connection or
keep a second, browser-owned connection registry. AIRI is only one possible
host; the same list can later include Codex or another approved adapter.

## Architecture

```text
Inspector browser
  -> development proxy (holds the dev-only runtime token)
  -> authenticated loopback runtime
  -> application / repository
  -> canonical connection settings and projection status
```

The new list operation is read-only and scoped by `PreferenceIdentity`. The
runtime remains the source of truth. The Inspector never reads SQLite, stores a
token in browser storage, or derives connections from audit history.

The page uses an explicitly configured development identity to select the
current user's relationship. It renders every matching connection returned by
the runtime, including an honest empty state when none exists. A development-
only launcher starts the runtime with explicit configuration and supplies the
development proxy token. It is outside the core runtime package boundary: core
construction and production APIs still read no environment variables.

## Connection controls

Each card displays the host ID, Observer provider/model label when one is
actually configured, three independent switches, and the latest projection
state. T11 runs the deterministic Fake Observer, so its truthful label is
"Local Fake Observer — no external model configured"; it never invents a
provider or model name.

- **Observe** controls evidence collection admission.
- **Learn** controls processing after collection.
- **Apply** controls projection of confirmed guidance to the host.
- **Proactive** is visibly unavailable in T11 and has no control or implied
  behavior.

Apply is destructive from the host's perspective. Turning it off requires a
confirmation step and an update using the current settings revision. The page
does not optimistically claim success. A `409 settings-revision-conflict`
requires a refresh; a failed projection remains an error state.

Projection wording is intentionally precise:

| Runtime state | Inspector wording |
| --- | --- |
| `clearing/unverified` | clearing requested; host confirmation pending |
| `tombstone-locally-written` | local clear instruction written; host confirmation pending |
| `verified-guidance-absent` | host confirmed guidance absent |
| `error` | projection failed; no clearance claim |

No UI state may represent a local write as verified host clearing.

## Privacy and failures

Connection list requests use only the configured identity; all data remains
local. The UI receives no token. Error displays use typed status/code messages
only and never render HTTP bodies, evidence, preference content, file paths, or
credentials. Missing runtime, authorization failure, empty list, revision
conflict, and projection error each have separate visible states.

## Verification

Before implementation, high-tier tests freeze:

- repository/application list semantics and identity isolation;
- loopback contract and typed client list method;
- an Inspector page with empty, loading, error, and populated states;
- independent observe/learn/apply updates;
- apply-disable confirmation and revision conflict refresh;
- the projection wording matrix above;
- no browser token or local-storage access.

T11 does not add an AIRI adapter, a real Observer provider/model integration,
proactive behavior, candidate review, profile editing, or data/history UI.
