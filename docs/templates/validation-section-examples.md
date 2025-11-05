# Validation Section Examples

This document provides copy-paste validation section templates for different package types. Use these in your task YAML files to ensure consistency with `standards/qa-commands-ssot.md`.

## Coverage Thresholds Reference

**Source of Truth:** `standards/testing-standards.md`

- **Repo-wide baseline:** ≥70% line coverage, ≥60% branch coverage
- **Tier-specific overrides:** Check `standards/<tier>-tier.md` for higher requirements
- Reference thresholds explicitly in validation descriptions

---

## Backend Package

Use this template for tasks affecting `backend/` code:

```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=@photoeditor/backend
      description: Auto-fix linting issues in backend package
    - command: pnpm turbo run qa:static --filter=@photoeditor/backend
      description: Run static analysis (typecheck + lint) on backend
    - command: pnpm turbo run test --filter=@photoeditor/backend
      description: Run unit tests for backend package
    - command: pnpm turbo run test:coverage --filter=@photoeditor/backend
      description: Run tests with coverage reporting to verify thresholds (≥70% lines, ≥60% branches per standards/testing-standards.md)
    - command: pnpm turbo run test:contract --filter=@photoeditor/backend
      description: Run contract tests to validate API schemas
  manual_checks: []
```

### With Fitness Functions

If your task affects domain, service, or architectural layers, add fitness function checks:

```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=@photoeditor/backend
      description: Auto-fix linting issues in backend package
    - command: pnpm turbo run qa:static --filter=@photoeditor/backend
      description: Run static analysis (typecheck + lint) on backend
    - command: pnpm turbo run qa:fitness --filter=@photoeditor/backend
      description: Run architectural fitness functions (domain purity, dependencies, duplication)
    - command: pnpm turbo run test --filter=@photoeditor/backend
      description: Run unit tests for backend package
    - command: pnpm turbo run test:coverage --filter=@photoeditor/backend
      description: Run tests with coverage reporting to verify thresholds (≥70% lines, ≥60% branches per standards/testing-standards.md)
    - command: pnpm turbo run test:contract --filter=@photoeditor/backend
      description: Run contract tests to validate API schemas
  manual_checks: []
```

---

## Mobile Package

Use this template for tasks affecting `mobile/` code:

```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=photoeditor-mobile
      description: Auto-fix linting issues in mobile package
    - command: pnpm turbo run qa:static --filter=photoeditor-mobile
      description: Run static analysis (typecheck + lint) on mobile
    - command: pnpm turbo run test --filter=photoeditor-mobile
      description: Run unit tests for mobile package
    - command: pnpm turbo run test:coverage --filter=photoeditor-mobile
      description: Run tests with coverage reporting to verify thresholds (≥70% lines, ≥60% branches per standards/testing-standards.md)
  manual_checks: []
```

### With Component Testing

If your task involves UI components or screens:

```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=photoeditor-mobile
      description: Auto-fix linting issues in mobile package
    - command: pnpm turbo run qa:static --filter=photoeditor-mobile
      description: Run static analysis (typecheck + lint) on mobile
    - command: pnpm turbo run test --filter=photoeditor-mobile
      description: Run unit tests for mobile package
    - command: pnpm turbo run test:coverage --filter=photoeditor-mobile
      description: Run tests with coverage reporting to verify thresholds (≥70% lines, ≥60% branches per standards/testing-standards.md)
  manual_checks:
    - Verify component renders correctly in iOS simulator
    - Verify component renders correctly in Android emulator
    - Test user interaction flows end-to-end
```

---

## Shared Package

Use this template for tasks affecting `shared/` contracts:

```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=@photoeditor/shared
      description: Auto-fix linting issues in shared package
    - command: pnpm turbo run qa:static --filter=@photoeditor/shared
      description: Run static analysis (typecheck + lint) on shared
    - command: pnpm turbo run test --filter=@photoeditor/shared
      description: Run unit tests for shared package
    - command: pnpm turbo run contracts:check --filter=@photoeditor/shared
      description: Run contract validation to ensure schema compatibility
  manual_checks: []
```

### With Contract Breaking Change Detection

If your task modifies API contracts:

```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=@photoeditor/shared
      description: Auto-fix linting issues in shared package
    - command: pnpm turbo run qa:static --filter=@photoeditor/shared
      description: Run static analysis (typecheck + lint) on shared
    - command: pnpm turbo run test --filter=@photoeditor/shared
      description: Run unit tests for shared package
    - command: pnpm turbo run contracts:check --filter=@photoeditor/shared
      description: Run contract validation to ensure schema compatibility
    - command: pnpm turbo run contracts:diff --filter=@photoeditor/shared
      description: Generate contract diff to detect breaking changes
  manual_checks:
    - Review contract diff for breaking changes
    - Update API version if breaking changes detected (per standards/shared-contracts-tier.md)
    - Verify backward compatibility with existing clients
```

---

## Infrastructure Tasks

Use this template for Terraform or infrastructure changes:

```yaml
validation:
  pipeline:
    - command: terraform fmt -check infrastructure/
      description: Verify Terraform formatting
    - command: terraform validate -chdir=infrastructure/
      description: Validate Terraform configuration syntax
    - command: tfsec infrastructure/
      description: Run security scanner on infrastructure code
  manual_checks:
    - Review terraform plan output for unexpected resource changes
    - Verify changes align with standards/infrastructure-tier.md requirements
    - Confirm state file backup exists before applying changes
```

---

## Documentation Tasks

Use this template for documentation-only changes:

```yaml
validation:
  pipeline: []  # No automated validation for pure documentation
  manual_checks:
    - Verify all links are valid and resolve correctly
    - Confirm examples are accurate and up-to-date
    - Check spelling and grammar
    - Ensure standards references cite correct file paths and headings
```

---

## Multi-Package Tasks

If your task affects multiple packages, combine validation commands:

```yaml
validation:
  pipeline:
    # Backend validation
    - command: pnpm turbo run lint:fix --filter=@photoeditor/backend
      description: Auto-fix linting issues in backend package
    - command: pnpm turbo run qa:static --filter=@photoeditor/backend
      description: Run static analysis on backend
    - command: pnpm turbo run test --filter=@photoeditor/backend
      description: Run backend unit tests

    # Shared validation
    - command: pnpm turbo run lint:fix --filter=@photoeditor/shared
      description: Auto-fix linting issues in shared package
    - command: pnpm turbo run qa:static --filter=@photoeditor/shared
      description: Run static analysis on shared
    - command: pnpm turbo run test --filter=@photoeditor/shared
      description: Run shared unit tests
    - command: pnpm turbo run contracts:check --filter=@photoeditor/shared
      description: Validate contracts

    # Mobile validation
    - command: pnpm turbo run lint:fix --filter=photoeditor-mobile
      description: Auto-fix linting issues in mobile package
    - command: pnpm turbo run qa:static --filter=photoeditor-mobile
      description: Run static analysis on mobile
    - command: pnpm turbo run test --filter=photoeditor-mobile
      description: Run mobile unit tests
  manual_checks: []
```

---

## Tips

1. **Always run lint:fix first** - Let automation clean up formatting before static analysis
2. **Run qa:static before tests** - Catch type errors before attempting test execution
3. **Include coverage commands** - Explicitly verify threshold compliance
4. **Reference standards** - Link coverage thresholds to `standards/testing-standards.md`
5. **Keep manual_checks minimal** - Prefer automated pipeline commands when possible
6. **Order matters** - Fast checks first (lint, typecheck), then expensive checks (tests, coverage)

## Validation Command Reference

For the complete list of available QA commands per package, see:
- **Authoritative source:** `standards/qa-commands-ssot.md`
- **Agent responsibilities:** `CLAUDE.md` (agent completion state section)
- **Coverage requirements:** `standards/testing-standards.md`
