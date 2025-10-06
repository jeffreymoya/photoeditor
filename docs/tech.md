**Mobile App (React Native)**
- Framework: `React Native` (Android API 24+ target)
- Language: TypeScript
- Navigation: `@react-navigation/native`
- Network + Caching: `react-query` with offline persistence (`@react-native-async-storage/async-storage`)
- Connectivity: `@react-native-community/netinfo`
- Camera: `react-native-vision-camera` (fast capture, permissions)
- Media picker (optional): `react-native-image-crop-picker`
- Image resize/compress/format: `react-native-compressor` or `react-native-image-resizer` (cap 4096px, quality tuning, HEIC→JPEG as needed)
- File access: `react-native-fs`
- Background uploads + retries/backoff: `react-native-background-upload` (to S3 presigned URLs)
- Forms/validation: `react-hook-form` + `zod`
- Push notifications: `@react-native-firebase/messaging` (FCM)
- Error reporting/crash: `Sentry React Native` (optional)

**API & Backend Runtime**
- Runtime: AWS Lambda (Node.js 20.x, TypeScript)
- API Gateway: HTTP APIs v2 (cheaper than REST) for:
  - `POST /upload/presign` – presign S3 uploads
  - `GET /jobs/{id}` – job status for in-app progress
  - Admin/ops endpoints as needed
- Packaging: `esbuild` bundling for Lambda
- SDKs: AWS SDK v3 (`@aws-sdk/*`) and S3 presigner (`@aws-sdk/s3-request-presigner`)
- Lambda Powertools (TypeScript) for structured logging, metrics, tracing

**Storage**
- Amazon S3
  - Temp bucket: `photo-temp-{env}` with SSE-S3, 48h expiration, block public access
  - Final bucket: `photo-final-{env}` with SSE-KMS (single CMK per env), versioning, presigned download access per user
  - Lifecycle: final images transition to Intelligent-Tiering or Standard-IA after 30 days; retain 365 days (then expire if desired)
  - Abort incomplete multipart uploads after 7 days
- Amazon DynamoDB
  - Table: `jobs` (PK: `jobId`) with status, timestamps, user id, and pointers to S3 keys
  - Billing: On-Demand to start (autoscale-free, cost-effective at low traffic)
  - TTL for job items aligned to 90-day audit policy

**Messaging & Orchestration**
- Amazon SQS (Standard Queue) for S3 `ObjectCreated` events → processing worker
  - Dead-letter queue with redrive policy
  - Long polling (e.g., 20s) to reduce request cost
- AWS Lambda worker
  - Consumes SQS, updates DynamoDB status: QUEUED → PROCESSING → EDITING → COMPLETED/FAILED
  - Calls external AI services (Gemini, Seedream) via HTTPS
  - Emits SNS notifications on status changes

**Notifications**
- Amazon SNS → Firebase Cloud Messaging integration
  - Option A (simplest): SNS Mobile Push with FCM platform application
  - Option B: Lambda publishes directly to FCM HTTP v1 (keep if you prefer no SNS platform app)
  - Store user FCM tokens in DynamoDB or via SNS endpoints

**AI Providers (Pluggable)**
- Image analysis provider (pluggable): e.g., Google Gemini, AWS Bedrock, or others
- Image editing provider (pluggable): e.g., Seedream or similar API
- Secrets/config: AWS Systems Manager Parameter Store (SecureString) + KMS

**Security, Compliance, IAM**
- TLS 1.2+ enforced on API Gateway; HSTS at CDN layer if added
- Encryption at rest:
  - S3 temp: SSE-S3
  - S3 final: SSE-KMS using a single CMK per env with rotation
  - DynamoDB: AWS-managed KMS
  - Secrets: AWS Secrets Manager (automatic rotation optional)
- IAM least privilege roles and scoped S3 bucket policies for presigned access
- CloudTrail (management events) enabled; Config (optional minimal rules) for drift visibility
- Audit logs retained 90 days (CloudWatch Logs retention policy)

**VPC & Networking**
- Placement: Keep API Lambdas public (no VPC) to avoid ENI cold starts; attach worker Lambdas to VPC only if needed for endpoints/private access
- Private subnets for worker Lambdas; VPC endpoints to cut NAT costs for:
  - S3 (Gateway), DynamoDB (Gateway), SSM (Interface), KMS (Interface), CloudWatch Logs (Interface)
- Egress to internet for external AI calls:
  - Dev/Stage: NAT Instance (t4g.nano or t3.nano) with hardening (most cost-effective)
  - Prod: Single NAT Gateway per region/AZ used; consider single-AZ initially to limit NAT count
- API Gateway endpoints public (with auth) and WAF optional for production

**Observability**
- CloudWatch Logs (structured JSON via Powertools), 90-day retention
- CloudWatch Metrics/Alarms for Lambda errors, SQS age, API Gateway 5xx
- AWS X-Ray tracing (optional) for end-to-end visibility
- Cost monitoring: AWS Budgets + alerts (monthly), Cost Explorer with cost allocation tags

**Content Delivery (Optional, Prod-Only)**
- Amazon CloudFront in front of final-image downloads when egress/latency justify it
  - Private origin access (OAC) to S3 final bucket
  - Signed URLs/cookies if needed; or continue using S3 presigned URLs

**Infrastructure as Code (Terraform)**
- Terraform 1.6+ with AWS Provider 5.x
- Remote state: S3 backend with DynamoDB state locking
- Workspaces/environments: `dev`, `stage`, `prod`
- Modules (in-house or community):
  - VPC (subnets, NAT choice per env, endpoints)
  - S3 (temp/final buckets, lifecycle, encryption)
  - DynamoDB (jobs table with TTL)
  - SQS + DLQ + Lambda event source mapping
  - Lambda functions (API handlers, worker) + IAM roles
  - API Gateway HTTP APIs (routes, stages, auth)
  - SNS (topics, platform app for FCM) or FCM direct
  - CloudWatch (logs, metrics, alarms)
  - KMS (CMK for final bucket)
  - SSM Parameter Store (secure strings)
  - Budgets and cost allocation tags
  - Policy as code scanning (optional): `tfsec` or `checkov`

**CI/CD**
- GitHub Actions
  - Mobile: Android build, unit tests, lint; optional Play Console deploy
  - Backend: `terraform fmt/validate/plan` and `apply` (with manual approval for prod)
  - OIDC federation to AWS (no long-lived keys)
  - Lambda TypeScript build with `esbuild` + unit tests

**Cost-Effective AWS Strategies**
- Prefer API Gateway HTTP API over REST (lower cost)
- Use SQS long polling; control Lambda batch size and reserved concurrency to prevent cost spikes
- DynamoDB On-Demand initially; add GSIs only when needed; enable TTL per 90-day policy
- S3 lifecycle rules: temp 48h expiry; final transition to Intelligent-Tiering or Standard-IA at 30 days; abort incomplete multipart uploads
- KMS: single CMK per env for final bucket; avoid unnecessary KMS usage on temp bucket
- Prefer SSM Parameter Store (SecureString) for secrets/config to minimize monthly secret costs; reserve Secrets Manager for cases needing managed rotation
- VPC endpoints for AWS services (S3, DynamoDB, SSM, KMS, Logs) to reduce NAT egress; NAT Instance in dev/stage; single NAT Gateway in prod
- Consolidate regions/AZs early to avoid cross-AZ data transfer; revisit for HA later
- CloudWatch Logs retention set to 90 days; filter noisy logs
- Budgets and alarms for total monthly spend and per-service thresholds
- Tag all resources with `Project`, `Env`, `Owner`, `CostCenter` for cost allocation and cleanup

**Auth & Access (App → API)**
- Phase 1: API key per app build or simple JWT (Cognito optional)
- Phase 2 (optional): Amazon Cognito for user auth and FCM token association

**Data Model Notes**
- Job item example (DynamoDB):
  - `jobId` (PK), `userId`, `status`, `createdAt`, `updatedAt`, `tempS3Key`, `finalS3Key`, `error`, `locale`, `settings`
  - TTL aligned with 90-day retention policy

**Environment Configuration**
- `dev`, `stage`, `prod` stacks with isolated accounts or prefixes
- Per-env S3 buckets, KMS keys, queues, and API endpoints
- Secrets per env in Secrets Manager

**Key Decisions Aligned To Requirements**
- Presigned S3 uploads from the app with three retries and backoff
- Object-created event → queue → worker Lambda orchestrates analysis → editing flow (providers pluggable)
- Only temp and final artifacts stored; no intermediate files; structured logs only
- In-app progress polling via `/jobs/{id}` and push via FCM
- Minimum compliance: TLS in transit, encryption at rest, least privilege, 90-day log retention, user consent flows
