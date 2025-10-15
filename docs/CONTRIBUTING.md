# Contributing to PhotoEditor

Thank you for your interest in contributing to PhotoEditor! This guide will help you get started with development.

## Prerequisites

- Node.js (v20 or later)
- npm (v9 or later)
- Terraform (for infrastructure changes)
- Git

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd photoeditor
```

### 2. Install Dependencies

This is a monorepo with multiple packages. Install dependencies for all packages:

```bash
# Install root dependencies (including Husky)
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install shared dependencies
cd shared && npm install && cd ..

# Install mobile dependencies
cd mobile && npm install && cd ..
```

### 3. Set Up Pre-commit Hooks

Pre-commit hooks are automatically installed when you run `npm install` in the root directory thanks to Husky. The hooks will:

- Check Terraform formatting with `terraform fmt -recursive -check`
- Run TypeScript type checking for backend package
- Run TypeScript type checking for shared package

These checks help maintain code quality and prevent common issues from being committed.

#### Verifying Hook Installation

To verify that hooks are installed correctly:

```bash
ls -la .husky/pre-commit
```

You should see the pre-commit hook file.

#### Manual Hook Setup (if needed)

If hooks weren't automatically installed, run:

```bash
npx husky install
```

### 4. Running Tests

```bash
# Backend tests
npm test --prefix backend

# Shared tests
npm test --prefix shared

# All quality checks (Stage A)
npm run qa-suite:static
```

## Development Workflow

### Making Changes

1. Create a new branch for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Ensure your changes pass local checks:
   ```bash
   # Type checking
   npm run typecheck --prefix backend
   npm run typecheck --prefix shared

   # Linting
   npm run lint --prefix backend
   npm run lint --prefix shared

   # Tests
   npm test --prefix backend
   npm test --prefix shared
   ```

4. Commit your changes:
   ```bash
   git add .
   git commit -m "Your descriptive commit message"
   ```

   The pre-commit hooks will automatically run and block the commit if there are issues.

5. Push your changes and create a pull request

### Infrastructure Changes

If you're modifying Terraform files:

1. Format your changes:
   ```bash
   terraform fmt -recursive infrastructure/
   ```

2. The pre-commit hook will verify formatting before allowing commits

## Pre-commit Hook Troubleshooting

### Hook Not Running

If the pre-commit hook isn't running:

1. Check if Husky is installed:
   ```bash
   npm list husky
   ```

2. Reinstall hooks:
   ```bash
   npx husky install
   ```

3. Ensure the hook is executable:
   ```bash
   chmod +x .husky/pre-commit
   ```

### Hook Failing

If the hook fails:

1. **Terraform formatting errors:**
   - Run `terraform fmt -recursive infrastructure/` to auto-fix
   - Commit the formatted files

2. **TypeScript type errors:**
   - Fix the type errors in your code
   - Run `npm run typecheck --prefix backend` or `npm run typecheck --prefix shared` to verify

3. **Slow hook performance:**
   - The hooks are designed to be fast, checking only formatting and types
   - If you need to bypass hooks temporarily (not recommended):
     ```bash
     git commit --no-verify -m "Your message"
     ```
     Note: Only use `--no-verify` in exceptional circumstances, as it bypasses important checks

### Disabling Hooks Temporarily

While not recommended, you can temporarily disable hooks:

```bash
# Skip pre-commit hooks (use sparingly)
git commit --no-verify -m "Emergency fix"
```

Always ensure your code passes all checks before pushing to the remote repository.

## Code Quality

This project maintains high code quality standards:

- **Type Safety:** All TypeScript code must pass strict type checking
- **Formatting:** All Terraform code must be properly formatted
- **Testing:** All new features should include appropriate tests
- **Linting:** Code should follow project ESLint rules

## Questions or Issues?

If you encounter any problems or have questions:

1. Check existing issues in the issue tracker
2. Review this contributing guide
3. Reach out to the team

Thank you for contributing to PhotoEditor!
