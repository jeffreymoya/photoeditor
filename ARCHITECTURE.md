# Architecture

## Overview
The photoeditor project is a multi-package monorepo composed of a React Native mobile client, an AWS Lambda-based backend, a shared TypeScript package with common contracts, and Terraform infrastructure definitions. The system enables users to capture or select photos, upload them for AI-driven analysis and editing, and receive processed results through polling or push notifications.

## Mobile Application (`mobile/`)
- Built with Expo/React Native (TypeScript) and structured around a stack + tab navigator (`mobile/src/navigation/AppNavigator.tsx`).
- State management via Redux Toolkit slices for image selection, job tracking, and application settings (`mobile/src/store/`).
- `ApiService` orchestrates single-image and batch uploads, manages presign requests, polls both `/status/{jobId}` and `/batch-status/{batchJobId}`, and exposes device token registration/deactivation helpers (`mobile/src/services/ApiService.ts`). The service currently maintains local Zod schemas that mirror `@photoeditor/shared`; consolidating on the shared package will reduce contract drift risk.
- `NotificationService` registers the device for Expo push notifications, persists the Expo push token, wires notification listeners, and schedules local notifications (`mobile/src/services/NotificationService.ts`).
- Screens under `mobile/src/screens/` provide UI for camera capture, gallery browsing, job/batch status, editing, and settings while dispatching Redux actions in response to notification events.

## Backend Services (`backend/`)
- Serverless runtime on AWS Lambda with handlers for presign, job status, device token management, secure downloads, and an SQS-driven worker (`backend/src/lambdas/`).
  - `presign.ts`: Validates single and batch upload requests, creates jobs (and batch jobs), and returns presigned S3 URLs.
  - `status.ts`: Fetches job metadata from DynamoDB for client polling.
  - `download.ts`: Serves presigned download URLs for completed jobs after verifying state.
  - `deviceToken.ts`: Registers or deactivates Expo push tokens against a DynamoDB table, enabling targeted notifications.
  - `worker.ts`: Processes S3 upload events, invokes AI providers, stores results, publishes notifications (job and batch level), and manages temp/final object lifecycles.
- Service layer (`backend/src/services/`) encapsulates domain logic:
  - `JobService`: DynamoDB persistence and status transitions.
  - `S3Service`: Key strategy, presigned URLs, and object lifecycle operations.
  - `NotificationService`: Publishes job, batch, and completion notifications to SNS/FCM.
  - `PresignService`: Coordinates job and batch creation alongside presign generation.
  - `DeviceTokenService`: Persists device registrations and lifecycle flags in DynamoDB.
  - `BootstrapService` + `ConfigService`: Resolve provider configuration from SSM and initialize dependency graph.
- Provider abstraction (`backend/src/providers/`) supplies pluggable analysis/editing implementations with shared retry/timeout logic (`BaseProvider`). Includes real integrations (Gemini, Seedream) and stub providers for development, selected via `ProviderFactory`.
- Utilities leverage AWS Lambda Powertools for logging, metrics, and tracing (`backend/src/utils/`).

## Shared Package (`shared/`)
- Distributed as `@photoeditor/shared` and referenced by backend and mobile packages.
- Provides Zod schemas for API payloads, job models, and provider contracts (`shared/schemas/`).
- Defines constants such as size limits, lifecycle parameters, and provider defaults (`shared/constants/index.ts`).
- Exposes TypeScript types for S3 key strategy, errors, and provider responses (`shared/types/`).

## Infrastructure (`infrastructure/`)
- Terraform configuration is presently scoped to LocalStack deployments and inlines the resources required for the worker pipeline (`infrastructure/main.tf`). The stack provisions:
  - KMS CMK, temp/final S3 buckets, queue + DLQ, SNS topic, DynamoDB jobs table, and supporting IAM policies.
  - Lambda functions for presign, status, worker, and download flows, exposed via a REST API Gateway for LocalStack.
- Batch job support relies on a DynamoDB companion table but still needs an API surface for `/batch-status` resolution.
- Device token management is implemented in code yet lacks Terraform definitions for the DynamoDB table, Lambda deployment, and API Gateway integration; these additions are required before enabling the feature outside of tests.
- A production VPC/data-plane build-out (e.g., NAT, VPC endpoints, Lambda per-subnet configuration) remains future work referenced in `docs/tech.md` but not yet codified.

## Data & Control Flow
1. Mobile client requests presigned upload URLs for single or batch workflows; `presign` creates the necessary job and batch records, returning temp S3 details.
2. Client uploads photos directly to the temp bucket and begins polling `/status/{jobId}` or `/batch-status/{batchJobId}` while also registering for push updates.
3. S3 object-created events enqueue messages to SQS; the worker Lambda consumes them, updates job status, invokes analysis/editing providers, maintains batch progress, stores final assets, and emits SNS notifications.
4. Upon completion, clients obtain processed images via download endpoints, job/batch polling, or push-notification deep links; `download` generates presigned final URLs on demand.

## Cross-Cutting Concerns
- Logging, metrics, and X-Ray tracing instrument Lambdas via Powertools (`backend/src/lambdas/*`).
- Strict schema validation and shared types ensure consistent API contracts between backend and shared libraries. The mobile client mirrors these Zod schemas locally today; adopting `@photoeditor/shared` on mobile would eliminate duplication.
- Provider bootstrap toggles between stub and real integrations based on SSM configuration, supporting local development and production.
- Terraform tags, lifecycle settings, and IAM policies enforce least privilege, encryption, and cost controls across environments.
- Push notification support spans the mobile `NotificationService`, backend `DeviceTokenService`, and SNS fan-out, but the infrastructure required for production device token storage and API exposure is pending.
