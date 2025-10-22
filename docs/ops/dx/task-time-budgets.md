# Task Time Budgets

**Date:** 2025-10-20  
**Compliance:** standards/cross-cutting.md L81

## Time Budget Thresholds

| Task | Target | Current P50 | Current P95 | Status |
|------|--------|-------------|-------------|--------|
| Build | <3 min | 2.1 min | 2.8 min | ✓ PASS |
| Unit Tests | <2 min | 1.3 min | 1.7 min | ✓ PASS |
| Integration Tests | <5 min | 3.2 min | 4.5 min | ✓ PASS |

## Remediation Policy

Per standards/cross-cutting.md L81:
- If any budget is breached twice in a sprint, a remediation plan is required
- Remediation plans must be logged in tasks/ with linked investigations
- CI duration dashboard attached to docs/ops/dx each release (L83)

## Monitoring

- Dashboard: `docs/ops/dx/ci-dashboard-export.json`
- Update Frequency: Per release
- Owner: Developer Experience Lead

## Recent Trends

- Build times stable over last 4 sprints
- Unit test times decreased 12% after parallelization improvements (Sprint 42)
- Integration test times within budget; LocalStack optimization completed

## Standards Reference

- standards/cross-cutting.md L81 (Task time budgets)
- standards/cross-cutting.md L83 (CI dashboard export)
