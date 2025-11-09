# 2025-10-04 — Speed Up deps Target with npm ci

- Date: 2025-10-04 14:25 UTC
- Agent: Claude Code (LLM)
- Branch: main
- Context: TASK-0019; Env: ops; Feature: Makefile Performance Optimization

## Summary

Updated the `make deps` target to use `npm ci` instead of `npm install` for all three workspaces (shared, backend, mobile). This provides faster, more deterministic dependency installation that strictly follows the committed lockfiles, reducing setup time and preventing drift from package-lock.json files.

## Changes Made

- `Makefile` (line 32-34): Changed `npm install` commands to `npm ci` for shared, backend, and mobile workspaces
  - `shared`: `npm ci --prefix shared || true` (kept fallback for optional workspace)
  - `backend`: `npm ci --prefix backend`
  - `mobile`: `npm ci --prefix mobile`

- `Makefile` (line 12): Updated help text from "Install Node deps (backend, mobile, shared)" to "Install Node deps deterministically (npm ci)"

## Rationale

- `npm ci` is faster than `npm install` because it bypasses package resolution and installs directly from lockfiles
- Provides deterministic, reproducible builds across all environments
- Removes existing `node_modules/` before installing, preventing stale dependencies
- Aligns with CI/CD best practices where lockfile adherence is critical
- All three workspaces have confirmed package-lock.json files present

## Impact

- Breaking: No (maintains identical functionality with different command)
- Migrations: None (developers should be aware that `npm ci` removes existing node_modules)
- Config/Env: None
- Security: Positive - stricter lockfile adherence reduces supply chain risks
- Performance: Positive - faster installation times for fresh workspaces
- User-facing: Faster `make deps` execution, transparent improvement

## Validation

- Confirmed lockfiles exist:
  ```bash
  ls backend/package-lock.json shared/package-lock.json mobile/package-lock.json
  ```
  All three files present

- Dry-run verification for backend:
  ```bash
  npm ci --prefix backend --dry-run
  ```
  Output: Successfully simulated installation from lockfile

- Dry-run verification for shared:
  ```bash
  npm ci --prefix shared --dry-run
  ```
  Output: Successfully simulated installation from lockfile (1 package)

- Dry-run verification for mobile:
  ```bash
  npm ci --prefix mobile --dry-run
  ```
  Output: Successfully simulated installation from lockfile

- Help text verification:
  ```bash
  make help | grep deps
  ```
  Output: `deps             Install Node deps deterministically (npm ci)`
  Confirmed: Help text now mentions deterministic installs

## Pending / TODOs

None - task fully completed and all acceptance criteria met.

## Next Steps

- Mark TASK-0019 as completed and archive to docs/completed-tasks/
- Continue with next priority task in the queue (TASK-0021 or TASK-0020)

## References

- Task: TASK-0019
- Related: `Makefile`
- Acceptance criteria: All met (npm ci used, fallback preserved for shared, help text updated)
