# PhotoEditor Monorepo — Local Development

This repo contains:
- `backend/` — AWS Lambda handlers (TypeScript) bundled with esbuild
- `mobile/` — React Native (Expo) client app
- `shared/` — Cross-cutting DTOs, validation schemas, and config
- `infra/sst/` — Serverless Stack (SST) project for live-dev deployments

The fastest way to iterate is to install dependencies once and use the Makefile shortcuts for repeatable backend builds, QA runs, and mobile workflows.

## Prerequisites
- Node.js 18+
- pnpm 8.x (install via `npm install -g pnpm` or enable corepack)
- iOS: Xcode + Simulator (macOS)
- Android: Android Studio + Emulator

Optional tooling
- `jq` for inspecting JSON during debugging
- `zip`/`unzip` for examining lambda bundles
- graphviz for dependency graphs

## Quickstart (Run via the App)

1. Install dependencies
   ```bash
   make deps
   ```

2. Launch the Expo app in your preferred simulator
   ```bash
   # iOS simulator (macOS)
   make mobile-ios

   # Android emulator
   make mobile-android
   ```

3. Alternatively, start the Expo dev server without selecting a platform yet:
   ```bash
   make mobile-start
   ```

While Expo is running you can exercise the flows (presign → upload → status → download) directly through the UI. Point the app at any API by setting `EXPO_PUBLIC_API_BASE_URL` before launching Expo or via the in-app developer settings.

## Common Tasks

- Build backend lambda bundles
  ```bash
  make backend-build
  ```

- Run the default QA fitness functions (static analysis, contracts, tests)
  ```bash
  make qa-suite
  ```

- Stop the Expo dev server
  ```bash
  make mobile-stop
  ```

- Deploy the SST live-dev stack for an AWS sandbox and open the hot-reload loop
  ```bash
  make live-dev
  ```

- Run smoke checks against the live SST stack
  ```bash
  make live-test
  ```

## Mobile App API Configuration

The mobile app reads its API base URL from the public Expo env var `EXPO_PUBLIC_API_BASE_URL`. When unset, the client defaults to `https://api.photoeditor.dev`. Override it when starting Expo, for example:
```bash
EXPO_PUBLIC_API_BASE_URL="https://staging.api.photoeditor.dev" pnpm turbo run start --filter=photoeditor-mobile
```

Android note: Emulators cannot reach the host via `localhost`. Use an IP or host alias that resolves from the emulator (e.g. `10.0.2.2`).

## QA and Build Pipeline

This monorepo uses **pnpm workspaces** and **Turborepo** for orchestration:

- **Quick static checks**: `pnpm turbo run qa:static --parallel`
- **Full QA suite**: `pnpm turbo run qa --parallel` or `make qa-suite`
- **Run tests**: `pnpm turbo run test`
- **Build lambdas**: `pnpm turbo run build:lambdas --filter=@photoeditor/backend`

### Turbo Pipelines

All lint, typecheck, test, contract, and build tasks are defined in `turbo.json`. Benefits:
- **Deterministic caching**: Skips unchanged tasks locally and shares artifacts via remote cache
- **Parallel execution**: Runs independent tasks concurrently
- **Incremental builds**: Only rebuilds affected packages
- **Remote caching**: Team members and CI share build artifacts (see ADR-0007)

### Remote Caching Setup (Optional)

1. Generate a Vercel token: https://vercel.com/account/tokens
2. Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):
   ```bash
   export TURBO_TOKEN=<your-token>
   export TURBO_TEAM=photoeditor
   ```
3. Verify: `pnpm turbo run build --dry-run` (should show remote cache enabled)

**CI setup**: Token is automatically configured in GitHub Actions via secrets (sourced from AWS SSM).

### Skip Controls

Turbo respects workspace dependencies. To run specific tasks:
```bash
# Run only for backend
pnpm turbo run test --filter=@photoeditor/backend

# Run for affected packages only
pnpm turbo run lint --filter=...

# Dry run to see what would execute
pnpm turbo run build --dry-run
```

See `turbo.json` for complete pipeline definitions.

## Related Docs
- Architecture: `ARCHITECTURE.md`
- Testing standards: `standards/testing-standards.md`
- ADRs: `adr/`
