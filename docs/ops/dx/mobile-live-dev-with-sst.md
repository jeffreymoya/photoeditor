# Mobile Live Dev With SST

Guide for running the Expo mobile app against the AWS sandbox that SST provisions in live-dev mode. Follow this when you need the full presign → upload → status loop without stubbing the backend.

## Prerequisites
- Node.js 18+, pnpm 8, platform toolchain for your target simulator/emulator (`README.md:11-36`)
- AWS CLI v2 with permissions to deploy the dev stack (IAM user or role scoped to PhotoEditor sandbox)
- Optional: `jq` for reading SST outputs, `watchman` or `fswatch` for log watching (`README.md:17-20`)

Run `make deps` once from the repository root to install all workspace dependencies (`README.md:24-41`).

## Configure AWS Credentials
1. Generate (or rotate) an IAM access key for your sandbox user via the AWS console: **IAM → Users → Your user → Security credentials → Create access key**. Capture the access key ID and secret before closing the dialog; AWS only shows the secret once (per IAM access key guidance).
2. Store the credentials in a dedicated CLI profile:
   ```bash
   aws configure --profile photoeditor-dev
   ```
   Supply the access key ID, secret access key, and default region (use `us-east-1` unless your sandbox stage says otherwise) (`docs/infra/environment-registry.md:317-325`).
3. Export the profile before running SST so every terminal reuses it:
   ```bash
   export AWS_PROFILE=photoeditor-dev
   ```
   You can add that export to your shell startup file for convenience. To confirm the setup, run:
   ```bash
   aws configure list --profile photoeditor-dev
   ```

If you rely on temporary credentials (STS, SSO), export `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` instead. SST picks up the same environment variables as the AWS CLI.

## Deploy The Live Dev Stack
Launch a dedicated terminal for infrastructure work and start the SST loop:
```bash
make live-dev
```
The Make target installs SST dependencies and runs `npx sst dev`, hot-reloading Lambda code on save (`Makefile:80-90`). Keep this terminal open; it streams deploy status and Lambda logs.

When the stack finishes bootstrapping it writes `infra/sst/.sst/outputs.json`. Extract the API endpoint with `jq`:
```bash
API_URL="$(jq -r '.api' infra/sst/.sst/outputs.json)"
echo "$API_URL"  # Example: https://abc123.execute-api.us-east-1.amazonaws.com
```

Sanity-check the deployment before pointing the mobile app at it:
```bash
make live-test
```
This command shells into SST and runs the scripted `/presign` and `/status` probes (`Makefile:84-90`, `scripts/sst-smoke-test.js:74-158`).

## Launch Expo Against SST
Open a second terminal for the mobile app. Propagate the API URL to Expo using the public env var the client expects (`README.md:72-79`, `mobile/src/services/upload/adapter.ts:79-132`):
```bash
export EXPO_PUBLIC_API_BASE_URL="$API_URL"
```
Then start your platform target:
```bash
make mobile-ios      # macOS / iOS simulator
# or
make mobile-android  # Android emulator
# or
make mobile-start    # Expo dev server only
```
The Makefile delegates to the turborepo scripts defined in `mobile/package.json`, so the commands work cross-platform (`Makefile:44-55`, `mobile/package.json:7-31`). Keep this terminal open for Metro logs and fast-refresh feedback.

### Emulator Notes
- Android emulators cannot reach `localhost`; the live stack runs in AWS so the direct URL works without special host aliases.
- For physical devices, make sure they can access the AWS endpoint (corporate VPNs/firewalls may block it). You can scan the QR code from Expo if your phone shares the same network as your development machine.

## Debugging Tips
- **Lambda logs**: Watch the `make live-dev` terminal; SST streams Powertools JSON logs. Use filters inside the SST console (`npx sst shell`) when you need deeper inspection (`Makefile:97-99`).
- **API corruption**: Re-run `make live-test` to quickly detect mismatched contracts.
- **Authentication errors**: Run `aws sts get-caller-identity` to confirm your credentials, then restart `make live-dev`.
- **Expo cache issues**: Clear Metro and restart with `make mobile-stop && make mobile-start`. The target kills lingering Expo processes (`Makefile:56-57`).
- **Env drift**: If you change the API URL, restart Expo or shake the device and use the developer settings to reload with the new base URL.

## Clean Up
When you finish testing:
```bash
make mobile-stop          # Stop Expo dev server
make live-destroy         # Tear down the SST dev stack
```
Destroying keeps AWS costs predictable and avoids leaving stale buckets or queues in your sandbox (`Makefile:56-57`, `Makefile:92-95`).

Capture any deviations from standards in a task file and cite the relevant tier docs if you introduce new workflows. This guide complements the monorepo quickstart in `README.md` and the SST parity effort described in `docs/infra/README.md`.
