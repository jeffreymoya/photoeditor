# Architectural Improvement Plan

## Frontend Tier

### UI Components Layer
- [x] Atomic Interface Elements (buttons, inputs, icons) (see docs/arch-improv/atomic-interface-elements.md)
- [x] Composite Interface Modules (forms, cards, media viewers) (see docs/arch-improv/composite-interface-modules.md)
- [x] Experience Screens (camera, gallery, home, jobs, preview, edit, settings) (see docs/arch-improv/experience-screens.md)
- [ ] Navigation Shell (stack/tab orchestration, deep-link routing)
- [ ] Error Handling Surfaces (error boundaries, fallback UI)

### State & Logic Layer
- [ ] Global Store Orchestration (Redux store, middleware, devtools integration)
- [ ] Media Lifecycle State (image capture, selection, editing state domain)
- [ ] Job Tracking State (job/batch lifecycle, polling metadata)
- [ ] Settings & Preferences State (feature flags, notification toggles)
- [ ] Hooks & Utility Logic (custom hooks, formatting helpers, type scaffolds)

### Services & Integration Layer
- [ ] API Orchestration Service (upload, status, batch coordination)
- [ ] Notification Orchestration Service (Expo push registration, handlers)
- [ ] Platform Integration Surface (Expo runtime settings, platform config)
- [ ] Asset & Media Pipeline (bundled assets, media catalog governance)

### Platform & Delivery Layer
- [ ] Application Bootstrapping (entry composition, providers, theming roots)
- [ ] Build & Toolchain Configuration (TypeScript, Babel, Metro, package manifest)
- [ ] Bridge Entrypoint (native bridge wiring, app registry)
- [ ] Quality Safeguards (mobile test harness, snapshot suites)

## Backend Tier

### Edge & Interface Layer
- [ ] BFF Composition (NestJS module topology, dependency graph)
- [ ] API Gateway Adapters (Lambda bootstrapper, handler adapters)
- [ ] Observability Interfaces (logging interceptors, tracing context)
- [ ] Error Governance (error taxonomy, filters, response mapping)
- [ ] BFF Delivery Pipeline (package configuration, test harness)

### Lambda Application Layer
- [ ] Upload Orchestration Handler (presign and batch entry)
- [ ] Status Query Handler (job and batch status retrieval)
- [ ] Asset Delivery Handler (secure download flow)
- [ ] Device Token Handler (registration and lifecycle management)
- [ ] Worker Pipeline Handler (processing, notifications, storage lifecycle)

### Domain Service Layer
- [ ] Configuration Bootstrap Service (environment resolution, dependency graph)
- [ ] Device Token Domain Service (persistence, deactivation policies)
- [ ] Job Lifecycle Service (state transitions, DynamoDB orchestration)
- [ ] Notification Dispatch Service (SNS/SQS fan-out, expo delivery)
- [ ] Presign Coordination Service (batch orchestration, validation)
- [ ] Storage Coordination Service (S3 key strategy, presign lifecycle)
- [ ] Domain Service Export Surface (barrel modules, dependency exposure)

### Provider Integration Layer
- [ ] Provider Factory (selection rules, dependency injection)
- [ ] Base Provider Abstraction (retry logic, timeouts, metrics)
- [ ] Analysis Provider Implementations (AI analysis integrations)
- [ ] Editing Provider Implementations (AI editing integrations)
- [ ] External AI Integrations (Gemini, Seedream connectors)
- [ ] Stubbed Provider Implementations (local/testing providers)
- [ ] Provider Export Surface (index governance)

### Shared Backend Utilities Layer
- [ ] AWS Client Library (client factories, connection pooling)
- [ ] Error Utility Suite (domain errors, mapping helpers)
- [ ] Logging Utility Suite (Powertools configuration, structured logging)
- [ ] Validation Utility Suite (schema validation, shared guards)
- [ ] Backend Utility Export Surface (index governance)

### Platform & Quality Layer
- [ ] Backend Build & Configuration (package manifest, tsconfig strategy)
- [ ] Automated Test Harness (jest configuration, global setup)
- [ ] Performance Test Suite (load, latency, cold start analysis)
- [ ] Unit Test Suite (services, utilities, lambda units)
- [ ] Integration Test Suite (end-to-end service validation)
- [ ] Reliability Test Suite (chaos, retry, DLQ validation)
- [ ] Contract Testing Suite (API contract verification)
- [ ] Test Fixture & Helper Libraries (fixtures, utility builders)
- [ ] Build Artifact Validation (bundle outputs, deployment packages)

## Shared Contracts Tier

### Distribution & Tooling Layer
- [ ] Shared Package Configuration (package manifest, tsconfig strategy)
- [ ] API Documentation Pipeline (api-extractor workflow)
- [ ] Distribution Artifacts (compiled dist bundle)
- [ ] Contract Snapshot Governance (snapshot versioning, diff review)
- [ ] Temporary Report Management (build-time reports, cleanup policy)

### Domain Constants & Types Layer
- [ ] Shared Constants Catalog (limits, feature flags, defaults)
- [ ] Error Typings (domain error contracts)
- [ ] Storage Typings (S3 key strategy, media descriptors)
- [ ] Root Export Surface (package entrypoints, index governance)

### Schema Definition Layer
- [ ] API Schema Definitions (request/response Zod models)
- [ ] Job Schema Definitions (job/batch domain models)
- [ ] Provider Schema Definitions (provider contract models)
- [ ] Schema Export Surface (index governance)

## Infrastructure Tier

### Terraform Control Plane Layer
- [ ] Root Module Composition (core infrastructure wiring)
- [ ] Variable Contract Definitions (input parameters governance)
- [ ] Output Contract Definitions (exported values governance)

### Terraform Environment Layer
- [ ] Environment Configuration Files (tfvars per environment)
- [ ] State Management Strategy (state files, locking, backups)
- [ ] Plan Artifact Governance (plan caching, review process)

### Terraform Module Layer
- [ ] API Gateway Module
- [ ] Budgets Module
- [ ] DynamoDB Module
- [ ] KMS Module
- [ ] Lambda Module
- [ ] Monitoring Module
- [ ] S3 Module
- [ ] SNS Module
- [ ] SQS Module
- [ ] VPC Module

### Alternate IaC Layer (SST)
- [ ] SST Project Configuration (environment wiring, stage config)
- [ ] SST API Stack (routes, auth, integration)
- [ ] SST Messaging Stack (queues, topics, subscriptions)
- [ ] SST Storage Stack (buckets, tables, encryption)

### Local Development Platform Layer
- [ ] Local Cloud Orchestration (docker-compose, emulated services)
- [ ] Local Automation Scripts (init, setup, smoke tests)

## Cross-Cutting Tier

### Observability & Operations Layer
- [ ] Telemetry Instrumentation (logging, metrics, tracing standards)
- [ ] Notification Pipeline Integration (end-to-end push orchestration)
- [ ] Job Lifecycle Model (shared state machine, error handling contracts)

### Developer Experience Layer
- [ ] Build & Task Automation (Make targets, scripted workflows)
- [ ] Repository Tooling Scripts (task helpers, smoke tests)
- [ ] Dependency & Contract Enforcement (dependency rules, contract checks)
- [ ] Coverage Enforcement (coverage budgets, mutation targets)

### Governance & Knowledge Layer
- [ ] Architecture Knowledge Base (architecture narrative, diagrams)
- [ ] Engineering Standards Catalogue (coding standards, exceptions)
- [ ] Testing Standards Catalogue (coverage, mutation, reporting)
- [ ] Technical Strategy Artifacts (roadmaps, refactor plans)
- [ ] ADR Library Governance (decision records, linkage)
- [ ] Task & Work Tracking (task definitions, acceptance criteria)
