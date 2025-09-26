# Architecture

## Overview
The photoeditor project is a multi-package monorepo composed of a React Native mobile client, an AWS Lambda-based backend, a shared TypeScript package with common contracts, and Terraform infrastructure definitions. The system enables users to capture or select photos, upload them for AI-driven analysis and editing, and receive processed results through polling or push notifications.

## Mobile Application (`mobile/`)
- Built with Expo/React Native (TypeScript) and structured around a stack + tab navigator (`mobile/src/navigation/AppNavigator.tsx`).
- State management via Redux Toolkit slices for image selection, job tracking, and application settings (`mobile/src/store/`).
- `ApiService` handles presign requests, image uploads to S3, job polling, and orchestrated processing workflows (`mobile/src/services/ApiService.ts`).
- `NotificationService` registers the device for push notifications and schedules local notifications using Expo APIs (`mobile/src/services/NotificationService.ts`).
- Screens under `mobile/src/screens/` provide UI for camera capture, gallery browsing, job status, editing, and settings.

## Backend Services (`backend/`)
- Serverless runtime on AWS Lambda with handlers for presign, job status, and an SQS-driven worker (`backend/src/lambdas/`).
  - `presign.ts`: Validates upload requests, creates job records, and returns presigned S3 URLs.
  - `status.ts`: Fetches job metadata from DynamoDB for client polling.
  - `worker.ts`: Processes S3 upload events, invokes AI providers, stores results, publishes notifications, and manages temp/final object lifecycles.
- Service layer (`backend/src/services/`) encapsulates domain logic:
  - `JobService`: DynamoDB persistence and status transitions.
  - `S3Service`: Key strategy, presigned URLs, and object lifecycle operations.
  - `NotificationService`: Publishes job state updates to SNS/FCM.
  - `PresignService`: Coordinates job creation and presign generation.
  - `BootstrapService` + `ConfigService`: Resolve provider configuration from SSM and initialize dependency graph.
- Provider abstraction (`backend/src/providers/`) supplies pluggable analysis/editing implementations with shared retry/timeout logic (`BaseProvider`). Includes real integrations (Gemini, Seedream) and stub providers for development, selected via `ProviderFactory`.
- Utilities leverage AWS Lambda Powertools for logging, metrics, and tracing (`backend/src/utils/`).

## Shared Package (`shared/`)
- Distributed as `@photoeditor/shared` and referenced by backend and mobile packages.
- Provides Zod schemas for API payloads, job models, and provider contracts (`shared/schemas/`).
- Defines constants such as size limits, lifecycle parameters, and provider defaults (`shared/constants/index.ts`).
- Exposes TypeScript types for S3 key strategy, errors, and provider responses (`shared/types/`).

## Infrastructure (`infrastructure/`)
- Terraform modules provision AWS resources aligned with the documented tech plan (`docs/tech.md`).
- Core stack (`infrastructure/main.tf`) wires:
  - VPC networking, NAT configuration, and VPC endpoints.
  - KMS CMK, S3 temp/final buckets, and lifecycle policies.
  - DynamoDB jobs table with TTL and encryption.
  - SQS queue + dead-letter queue for processing pipeline.
  - Lambda functions with tailored IAM roles and the API Gateway HTTP API.
  - SNS topic for job status notifications.
- Module composition under `infrastructure/modules/` encapsulates resource definitions (e.g., `lambda`, `s3`, `dynamodb`).

## Data & Control Flow
1. Mobile client requests a presigned upload URL; backend `presign` Lambda creates a job record and returns S3 upload details.
2. Client uploads the photo directly to the temp S3 bucket using the presigned URL and begins polling `/status/{jobId}`.
3. S3 object-created events enqueue messages to SQS; the worker Lambda consumes them, updates job status, invokes analysis and editing providers, stores final assets, and emits SNS notifications.
4. Upon completion, clients obtain the processed image via job polling, push notification handling, or separate download requests using generated S3 keys/URLs.

## Cross-Cutting Concerns
- Logging, metrics, and X-Ray tracing instrument Lambdas via Powertools (`backend/src/lambdas/*`).
- Strict schema validation and shared types ensure consistent API contracts between clients and services.
- Provider bootstrap toggles between stub and real integrations based on SSM configuration, supporting local development and production.
- Terraform tags, lifecycle settings, and IAM policies enforce least privilege, encryption, and cost controls across environments.
