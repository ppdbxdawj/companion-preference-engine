# Public Development Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare a truthful, public-facing development preview of the companion preference engine with a clear license, reproducible checks, and contributor-safe documentation.

**Architecture:** Keep the preview local-first and host-neutral. Document the completed contracts, resolver, lifecycle, and in-memory governance repository while explicitly marking runtime, UI, MCP, SQLite, and AIRI adapters as future work. Use GitHub Actions as the reproducible validation boundary.

**Tech Stack:** Node.js 24.19.0, pnpm 10.34.5, TypeScript, Valibot, Vitest, tsdown, GitHub Actions, Markdown.

---

### Task 1: Add public repository policy files

**Files:**
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`

**Step 1: Write the files**

Add Apache-2.0, a short vulnerability-reporting policy that does not promise an unsupported private channel, and contributor guidance using the checked-in commands.

**Step 2: Verify references**

Run: `rg -n "pnpm (install|run)|Node|security|license" LICENSE SECURITY.md CONTRIBUTING.md`

Expected: every command and policy link points to a real repository surface.

### Task 2: Replace the bootstrap README with a preview guide

**Files:**
- Modify: `README.md`
- Create: `README.zh-CN.md`

**Step 1: Write the English source README**

Document the problem, completed M0 capabilities, architecture/data flow, quickstart, limitations, privacy defaults, roadmap, and links to contribution/security/license files.

**Step 2: Add the Chinese parity README**

Mirror task-critical headings, prerequisites, commands, warnings, and limitations. Keep code blocks identical to the English source.

**Step 3: Verify parity and links**

Run: `rg -n "README.zh-CN|CONTRIBUTING|SECURITY|Apache|pnpm run check|pnpm run build" README.md README.zh-CN.md`

Expected: both locales contain the same commands and required warnings.

### Task 3: Make package scripts and CI truthful

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

**Step 1: Remove the invalid runtime dev entry**

Remove the `dev` script that filters packages not present in this preview. Keep `check`, `test`, `typecheck`, and `build` as the supported gates.

**Step 2: Add CI**

Use Node 24.19.0 and pnpm 10.34.5, install with `--frozen-lockfile`, then run `pnpm run check` and `pnpm run build` on pushes and pull requests.

**Step 3: Validate locally**

Run the exact Node 24 test/typecheck/build commands and `git diff --check`.

### Task 4: Run the public-preview gate and commit

**Files:**
- No additional files.

**Step 1: Check for secrets and stale claims**

Run `rg -n "(sk-|ghp_|BEGIN .*PRIVATE KEY|TODO\(T5|M0 workspace bootstrap|runtime-local|inspector)" --glob '!pnpm-lock.yaml' .` and review matches.

**Step 2: Run the gates**

Run: `pnpm install --frozen-lockfile`, `pnpm run check`, and `pnpm run build` where the pinned toolchain is available.

**Step 3: Commit the preview**

Commit with: `docs: publish public development preview`

Do not push until the public repository target and remote are confirmed.
