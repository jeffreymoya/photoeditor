# QA Commands SSOT (Authoritative)

Purpose

- Single source of truth for how to run static analysis, unit tests, and contract checks across the repo. This document defines commands and when to use repo‑wide vs package‑scoped runs. Thresholds and gates live elsewhere and are not duplicated here.

Precedence

- Commands SSOT: this file.
- Thresholds: see `standards/testing-standards.md` (coverage) and `standards/cross-cutting.md` (complexity, hard‑fail controls).
- Process/governance: see `standards/standards-governance-ssot.md`.

Repo‑wide Baseline (humans)

- Use for quick pre‑PR hygiene across the monorepo:
  - `pnpm turbo run qa:static --parallel`

Package‑Scoped (preferred for agents and focused work)

- Backend (@photoeditor/backend)
  - Auto-fix: `pnpm turbo run lint:fix --filter=@photoeditor/backend` (run before static checks to auto-fix unused imports, formatting, etc.)
  - Static: `pnpm turbo run qa:static --filter=@photoeditor/backend`
  - Unit: `pnpm turbo run test --filter=@photoeditor/backend`
  - Fitness (backend-specific, when applicable):
    - `pnpm run qa:dependencies`
    - `pnpm run qa:dead-exports`
    - `pnpm run qa:duplication`
    - `node scripts/ci/check-domain-purity.mjs --output /tmp/domain-purity.json`
    - `node scripts/ci/traceparent-drill.mjs --logs docs/evidence/logs/powertools-sample.json --output /tmp/trace-drill-report.json`

- Mobile (photoeditor-mobile)
  - Auto-fix: `pnpm turbo run lint:fix --filter=photoeditor-mobile` (run before static checks to auto-fix unused imports, formatting, etc.)
  - Static: `pnpm turbo run qa:static --filter=photoeditor-mobile`
  - Unit: `pnpm turbo run test --filter=photoeditor-mobile`

- Shared (@photoeditor/shared)
  - Auto-fix: `pnpm turbo run lint:fix --filter=@photoeditor/shared` (run before static checks to auto-fix unused imports, formatting, etc.)
  - Static: `pnpm turbo run qa:static --filter=@photoeditor/shared`
  - Unit: `pnpm turbo run test --filter=@photoeditor/shared`
  - Contracts:
    - Build/gen prereqs: `pnpm turbo run build --filter=@photoeditor/shared`
    - Generate: `pnpm turbo run contracts:generate --filter=@photoeditor/shared`
    - Check: `pnpm turbo run contracts:check --filter=@photoeditor/shared`

When to Use What

- Humans (PRs): run repo‑wide static once, then package‑scoped tests for affected packages.
- Agents: run package‑scoped commands only (per affected package). **Always run `lint:fix` before `qa:static`** to auto-fix unused imports, formatting issues, etc. Backend agents may include fitness functions listed above.

Evidence & Artifacts

- Attach outputs according to `standards/testing-standards.md` and tier standards. This file does not define evidence locations.

Notes

- Do not restate thresholds (coverage, complexity) here. Link to the relevant standards instead.

