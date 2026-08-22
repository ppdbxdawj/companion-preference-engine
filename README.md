# Companion Preference Engine

Local-first, host-neutral governance for companion-agent preferences.

[中文说明](README.zh-CN.md) · [Apache-2.0](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

> **Development Preview — M0**
>
> This repository is an experimental core library. It is not a chat product
> and does not yet ship a runtime process, UI, MCP server, HTTP server,
> SQLite backend, or AIRI adapter.

## Why this exists

Conversation memory answers “what facts or events should be retained?”. A
companion also needs governed answers to “how should it accompany this user in
this context?”. This project separates that decision from any particular LLM
or host:

```text
host evidence / explicit user input
                │
                ▼
        candidate + provenance
                │  user confirmation / rejection / suppression
                ▼
      governed active preferences
                │
                ▼
   scoped resolver + explanation + projection status
```

The engine is deliberately conservative: connection settings default to
deny, writes are revision-fenced and idempotent, audits and mutation receipts
are content-free, and evidence deletion scrubs references before returning a
tombstone.

## What is implemented

- Strict, host-neutral Valibot contracts for identity, preferences, audits,
  HTTP envelopes, and MCP-facing provenance.
- Candidate lifecycle: propose, confirm, reject, delete, suppress, revise,
  revoke, and explicit user-set preferences.
- Scoped preference resolution for host, domain, workspace, and global
  contexts, with deterministic ordering and explanations.
- An in-memory repository with clone-isolated reads, action replay, typed
  revision and slot conflicts, strict audit events, and staged rollback.
- Local connection settings, adapter projection truth, content-free policy
  decision audits, evidence tombstones, candidate scrubbing, and optional
  dependent-preference revocation.

The current implementation is an embeddable foundation, not a finished agent.

## Quickstart

Requirements:

- Node.js 24.19.0 (`.node-version`)
- pnpm 10.34.5

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

`pnpm run check` runs all Vitest suites, both package typechecks, and
`git diff --check`. The preview currently has no `pnpm dev` command because no
runtime or UI package exists yet.

## Package map

```text
packages/contracts      public schemas, types, and deterministic fixtures
packages/preference-core
  lifecycle             candidate/preference transitions
  resolver              scope and authority resolution
  explain               human-readable resolution explanations
  repository            host-neutral repository port and errors
  in-memory-repository  local reference implementation
docs/plans              design, implementation, routing, and preview plans
```

Both packages are currently private workspace packages. The public preview is
source-first; npm publishing is intentionally out of scope until a stable
runtime and persistence contract exist.

## Privacy and security boundaries

- No network calls or host integrations are performed by the core.
- The default connection policy is deny-by-default: observation, learning,
  and application are all off until explicitly configured.
- Audits, mutation receipts, policy decisions, and deletion tombstones do not
  store conversation text, preference values, projections, or request
  payloads.
- Evidence is process-local and can contain raw content before deletion.
  Treat exported snapshots as sensitive data.
- Deletion removes live evidence, creates a content-free tombstone, deletes
  evidence-only pending candidates, scrubs retained references, and can revoke
  dependent active preferences when explicitly requested.

These are implementation and test boundaries for the current preview, not a
claim that an unimplemented adapter will be safe automatically. See
[SECURITY.md](SECURITY.md) before embedding the repository.

## Verification

The development preview is gated by:

```bash
pnpm run check
pnpm run build
```

GitHub Actions repeats both commands on pushes and pull requests. The test
suite covers contracts, lifecycle transitions, scope resolution, explanations,
atomic repository behavior, and privacy/deletion invariants.

## Roadmap

The next layers are intentionally separate from this core:

1. A small local runtime and persistence adapter with explicit snapshot and
   migration semantics.
2. A host adapter (first AIRI, then other companion hosts) that supplies
   evidence and consumes projection decisions.
3. An inspector for active preferences, provenance, suppression, deletion, and
   projection truth.
4. Optional MCP/HTTP adapters with the same contracts and privacy gates.

None of those layers is implemented in this preview. Design details and
acceptance criteria live under [`docs/plans/`](docs/plans/).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull
request. Security-sensitive reports belong in [SECURITY.md](SECURITY.md), not
in a public issue.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
