# Contributing

This repository is an experimental companion-preference engine. Contributions
should keep the core host-neutral, local-first, deterministic, and safe to
embed in AIRI or another host later.

## Setup

Requirements:

- Node.js 24.19.0 (see `.node-version`)
- pnpm 10.34.5

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

## Before opening a pull request

- Add or update focused tests for behavior changes.
- Run `pnpm run check` and `pnpm run build`.
- Run `git diff --check`.
- Do not include credentials, real conversations, or host-native private data.
- Keep public contracts and snapshots content-free where the design requires
  it.

## Scope and review

Small, focused pull requests are preferred. Explain the state transition,
privacy boundary, idempotency behavior, and rollback behavior for changes to
`packages/preference-core`. New host integrations, network transports,
runtime services, or persistence backends should first include a design note
under `docs/plans/`.

## Current preview limits

The public preview does not include a runtime process, UI, MCP server, AIRI
adapter, SQLite backend, or npm publishing workflow. Please do not describe
those as implemented in issues or pull requests.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md).
