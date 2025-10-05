# ADR 0002: Use AWS Serverless Event-Driven Pipeline for Image Processing

- Status: Accepted
- Date: 2025-10-04

## Context
The core workflow requires ingesting images from mobile clients, storing them in S3, invoking AI providers, and notifying users when edits are ready. The architecture doc shows the backend built around AWS Lambda handlers with S3, DynamoDB, SNS, and SQS integration to orchestrate the flow (`ARCHITECTURE.md:13-48`). The worker Lambda processes SQS events triggered by S3 uploads, updates DynamoDB job records, invokes analysis/editing providers, and emits notifications (`backend/src/lambdas/worker.ts:1-199`). Terraform configuration provisions the supporting LocalStack resources—S3 buckets, queues, tables, SNS topic, and Lambda roles—mirroring the intended AWS deployment (`infrastructure/main.tf:1-183`).

## Decision
Standardize on an AWS serverless design where API Gateway routes requests to Lambda functions, uploads land in S3, and downstream processing happens through SQS-triggered Lambdas with DynamoDB state management. Notifications fan out through SNS and device tokens once the job pipeline finishes. Infrastructure definitions remain codified in Terraform for parity between LocalStack and eventual AWS environments.

## Consequences
- Positive: Event-driven Lambdas can scale with workload spikes without pre-provisioned servers, and SQS decouples upload ingestion from AI processing.
- Positive: Managed services (S3, DynamoDB, SNS) reduce undifferentiated ops work while Powertools supplies observability for Lambda execution.
- Negative: Cold starts and execution limits require mitigation (warming, batching) for latency-sensitive flows. Local development depends on LocalStack parity, and certain features (push notification integrations) remain partially simulated (`ARCHITECTURE.md:36-55`).

## Related Work
- Architecture documentation outlining Lambda handlers, S3/SQS orchestration, and notification flow (`ARCHITECTURE.md:13-55`).
- Worker Lambda implementation handling SQS events, provider orchestration, and notifications (`backend/src/lambdas/worker.ts:1-199`).
- Terraform stack provisioning LocalStack AWS resources for the pipeline (`infrastructure/main.tf:1-183`).
