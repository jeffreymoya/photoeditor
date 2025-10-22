# PhotoEditor Monorepo — Local Development

This repo contains:
- `backend/` — AWS Lambda handlers (TypeScript) bundled with esbuild
- `infrastructure/` — Terraform for AWS resources (LocalStack for local)
- `mobile/` — React Native (Expo) client app

The fastest way to run the full stack locally and test through the app is via the Makefile targets below.

## Prerequisites
- Node.js 18+
- pnpm 8.x (install via `npm install -g pnpm` or enable corepack)
- Docker and Docker Compose
- Terraform >= 1.6
- AWS CLI v2
- iOS: Xcode + Simulator (macOS)
- Android: Android Studio + Emulator

Optional
- `jq` for inspecting JSON
- `zip`/unzip tools (lambda packaging)
- graphviz (for dependency graphs)

## Quickstart (Run via the App)

1) Install dependencies
```
make deps
```

2) Launch end‑to‑end with iOS or Android
```
# iOS simulator (macOS)
make dev-ios

# Android emulator (uses host alias 10.0.2.2)
make dev-android
```

What these do
- Starts LocalStack (`docker-compose.localstack.yml`)
- Builds backend lambda bundles (`backend/dist/lambdas/.../*.zip`)
- Applies Terraform to LocalStack (`infrastructure/`)
- Reads the API url from Terraform output and passes it to Expo as `EXPO_PUBLIC_API_BASE_URL`
- Starts the mobile app (Expo) pointed at the local API

Open the app and run the flows (presign → upload → status → download) entirely through the UI.

## Common Tasks

- Start LocalStack only
```
make localstack-up
```

- Build backend lambda bundles
```
make backend-build
```

- Initialize + Apply Terraform to LocalStack
```
make infra-init
make infra-apply
```

- Start Expo without choosing platform yet
```
make mobile-start
```

- Launch platform directly (injects API url into Expo)
```
make mobile-ios
make mobile-android
make mobile-web
```

- Print the API url (from Terraform outputs)
```
make print-api
```

## Stopping / Cleanup

- Stop Expo dev server
```
make mobile-stop
```

- Destroy infra and stop LocalStack (full teardown)
```
make infra-down
```

You can also destroy or stop individually:
```
make infra-destroy
make localstack-down
```

## Mobile App API Configuration

The app reads its API base URL from the public Expo env var `EXPO_PUBLIC_API_BASE_URL`. The Make targets set this automatically from Terraform outputs. If needed, you can override manually when starting Expo, for example:
```
EXPO_PUBLIC_API_BASE_URL="http://localhost:4566/restapis/<apiId>/dev/_user_request_" pnpm turbo run start --filter=photoeditor-mobile
```

Android note: Emulators cannot reach the host via `localhost`. The Make target rewrites `localhost` to `10.0.2.2` for Android.

## Troubleshooting

- LocalStack health
```
curl -s http://localhost:4566/_localstack/health | jq
```

- LocalStack logs
```
docker compose -f docker-compose.localstack.yml logs -f localstack
```

- Re‑apply infra after code changes
```
make backend-build
make infra-apply
```

- Get API url again
```
make print-api
```

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

Turborepo remote caching accelerates local development by sharing build artifacts across your team and CI. To enable:

1. Generate a Vercel token: https://vercel.com/account/tokens
2. Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):
   ```bash
   export TURBO_TOKEN=<your-token>
   export TURBO_TEAM=photoeditor
   ```
3. Verify: `pnpm turbo run build --dry-run` (should show remote cache enabled)

**CI setup**: Token is automatically configured in GitHub Actions via secrets (sourced from AWS SSM).

**Note**: Remote caching is optional. If not configured, Turbo uses local-only caching with no impact on builds.

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
- Infra overview: `infrastructure/README.md`
- E2E steps and scenarios: `docs/e2e-tests.md`
- Architecture: `ARCHITECTURE.md`
- Testing standards: `standards/testing-standards.md`
