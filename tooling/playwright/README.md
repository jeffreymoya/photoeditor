# Playwright Tooling

This directory is reserved for shared Playwright utilities and tooling that may be used across multiple test suites (smoke, E2E, contract tests, etc.).

## Current Structure

Currently, all Playwright configuration and tests are located in:

- **Configuration:** `backend/playwright.config.ts`
- **Smoke Tests:** `backend/tests/smoke/`
- **Documentation:** `docs/evidence/playwright-smoke-notes.md`

## Future Expansion

Potential tooling candidates for this directory:

- Shared Playwright fixtures (LocalStack setup/teardown, API client wrappers)
- Custom reporters (trace exporters, coverage reporters)
- CI integration scripts (artifact uploads, trace analysis)
- Contract test generators (from OpenAPI specs)

## Related Documentation

- `docs/evidence/playwright-smoke-notes.md` - Smoke test suite documentation
- `backend/playwright.config.ts` - Playwright configuration
- `standards/testing-standards.md` - E2E test requirements
