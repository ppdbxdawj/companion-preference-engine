# Companion Preference Engine

A local-first, host-neutral engine for governed companion preferences.

Status: M0 workspace bootstrap only. No runtime, UI, host adapter, AIRI integration, or MCP server is implemented yet.

## Requirements

- Node.js 24.19.0
- pnpm 10.34.5

## Bootstrap verification

    pnpm install --frozen-lockfile
    pnpm test --passWithNoTests

Implementation is governed by the [design](docs/plans/2026-08-20-companion-preference-engine-design.md), [implementation plan](docs/plans/2026-08-20-companion-preference-engine.md), and [agent-routing protocol](docs/plans/2026-08-20-companion-preference-engine-agent-routing.md).
