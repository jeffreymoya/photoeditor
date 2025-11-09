# 2025-10-04 — Provider Selection via SSM Parameters

- Date: 2025-10-04 14:15 UTC
- Agent: Claude Code (LLM)
- Branch: main
- Context: TASK-0016; Env: backend; Feature: Provider Factory Centralization

## Summary

Centralized provider selection for analysis and editing behind a factory pattern using SSM parameters. Providers can now be swapped without code changes by updating SSM parameter values. Added validation, safe defaults, and comprehensive demo documentation.

## Changes Made

- `backend/src/services/config.service.ts`: Added `getAnalysisProviderName()` and `getEditingProviderName()` methods to fetch provider names from SSM parameters `providers/analysis` and `providers/editing`, with safe defaults (`gemini` and `seedream` respectively).

- `backend/src/services/bootstrap.service.ts`: Refactored `initializeProviders()` to fetch provider names from SSM and validate them against allowed values. Added private helper methods `getAnalysisProviderConfig()` and `getEditingProviderConfig()` to encapsulate provider-specific configuration logic.

- `docs/evidence/provider-swap.md`: Created comprehensive demo guide documenting how to swap providers using SSM parameters, including AWS CLI commands, local development setup, error handling, and implementation details.

## Rationale

- Enables zero-code-change provider swapping through configuration management
- Centralizes provider selection logic in one place (BootstrapService)
- Validates provider names to prevent runtime errors from invalid configurations
- Provides safe defaults to ensure system works even if SSM parameters are missing
- Separates provider configuration concerns for better maintainability

## Impact

- Breaking: No
- Migrations: None
- Config/Env: Two new optional SSM parameters: `/<PROJECT>-<ENV>/providers/analysis` and `/<PROJECT>-<ENV>/providers/editing`
- Security: No new surface; continues using encrypted SSM parameters for API keys
- Performance: Neutral; same number of SSM calls, just reading additional parameters
- User-facing: No immediate impact; enables future provider flexibility

## Validation

- Lint: Ran `npm run lint` in backend - clean
- TypeScript: Ran `npx tsc --noEmit` - no type errors
- Grep verification:
  - Confirmed `providers/analysis` and `providers/editing` references in config.service.ts
  - Confirmed `initialize()` calls in bootstrap.service.ts
- Manual: Code review confirms proper error handling and validation logic

## Pending / TODOs

- [P2][status: todo][owner: LLM] Add unit tests for new ConfigService methods (accept: tests pass with mocked SSM client)
- [P2][status: todo][owner: LLM] Add unit tests for BootstrapService provider validation logic (accept: tests verify error messages for invalid providers)
- [P2][status: todo][owner: LLM] Add integration test demonstrating provider swap via SSM (accept: test swaps providers and verifies correct instance is used)

## Next Steps

- Mark TASK-0016 as completed and archive
- Consider adding tests for the new functionality
- Update infrastructure Terraform to create the new SSM parameters with default values

## References

- Task: TASK-0016
- Related: `backend/src/providers/factory.ts`, `backend/src/services/bootstrap.service.ts`, `backend/src/services/config.service.ts`
- Documentation: `docs/evidence/provider-swap.md`
