# Architecture Layers

## Backend Layer Structure

### Layer Diagram
```
┌─────────────────────────────────────┐
│         Lambda Handlers             │
│  (Validation, Routing, Error Map)   │
│         MAX 50 LOC, CC ≤ 5          │
└──────────────┬──────────────────────┘
               │ calls
               ▼
┌─────────────────────────────────────┐
│       Services / Use Cases          │
│     (Business Logic & Flows)        │
└──────────────┬──────────────────────┘
               │ calls
               ▼
┌─────────────────────────────────────┐
│      Adapters / Providers           │
│   (AWS SDK, External APIs, DB)      │
│    ONLY layer with SDK imports      │
└─────────────────────────────────────┘
```

## Layer Responsibilities

### Handlers (API Gateway Lambda Functions)
- **Location**: `backend/src/lambdas/`
- **Responsibilities**:
  - Validate input (request body, params, headers)
  - Call exactly ONE service method
  - Map domain errors to HTTP status codes
  - Return DTO (Data Transfer Object)
- **Constraints**:
  - Maximum 50 lines of code
  - Cyclomatic complexity ≤ 5
  - No loops over business collections
  - NO SDK or database access
  - NO business logic
- **Example**: `presign.ts`, `status.ts`, `download.ts`, `deviceToken.ts`

### Services / Use Cases
- **Location**: `backend/src/services/`
- **Responsibilities**:
  - Orchestrate business workflows
  - Implement business rules and validation
  - Coordinate multiple adapters if needed
  - Handle transactional boundaries
- **Constraints**:
  - May call multiple adapters
  - May contain business logic and validations
  - NO direct SDK imports
  - Return domain models or DTOs
- **Example**: `s3.service.ts`, `notification.service.ts`, `config.service.ts`

### Adapters / Providers
- **Location**: `backend/src/providers/`, `backend/src/adapters/` (if exists)
- **Responsibilities**:
  - Own all I/O operations
  - AWS SDK client instantiation and usage
  - External API calls
  - Database operations
  - Message queue operations
- **Constraints**:
  - ONLY layer that imports AWS SDK
  - Translate external responses to domain models
  - Handle retries and error mapping
- **Example**: `gemini.provider.ts`, `seedream.provider.ts`

## Verification

### No SDK in Handlers
```bash
# This should return nothing
rg '@aws-sdk' backend/src/lambdas/
```

### Handler Complexity
```bash
# Check cyclomatic complexity (use ts-complexity or similar)
npx ts-complexity backend/src/lambdas/*.ts --threshold 5
```

### Import Graph
See `import-graph.png` for visual representation of dependencies.

## Mobile Layer Structure

### Layer Diagram
```
┌─────────────────────────────────────┐
│            Screens                  │
│      (Navigation, Layout)           │
└──────────────┬──────────────────────┘
               │ uses
               ▼
┌─────────────────────────────────────┐
│      Feature Components             │
│    (Business-specific UI)           │
└──────────────┬──────────────────────┘
               │ uses
               ▼
┌─────────────────────────────────────┐
│       Shared UI Components          │
│     (Reusable, generic UI)          │
└──────────────┬──────────────────────┘
               │ uses
               ▼
┌─────────────────────────────────────┐
│        Hooks & Services             │
│  (API, State, Device Integration)   │
└─────────────────────────────────────┘
```

### Mobile Responsibilities

#### Screens
- **Location**: `mobile/src/screens/`
- **Constraint**: No cross-feature imports
- **Example**: `CameraScreen.tsx`, `GalleryScreen.tsx`, `EditScreen.tsx`

#### Feature Components
- Feature-specific, composed components
- No direct API calls (use hooks)

#### Shared UI
- Generic, reusable components
- No business logic

#### Hooks & Services
- **Location**: `mobile/src/hooks/`, `mobile/src/services/`
- API integration (`ApiService.ts`)
- State management (React Query)
- Device features (camera, storage)

## Terraform Module Structure

### Required Modules
Each module must include:
- `variables.tf` - Input variables
- `outputs.tf` - Output values
- `main.tf` - Resource definitions
- `README.md` - Documentation

### Module List
- `s3` - S3 buckets (temp and final)
- `dynamodb` - DynamoDB tables
- `sqs` - SQS queues and DLQs
- `lambda` - Lambda functions
- `apigateway` - API Gateway
- `kms` - KMS keys
- `budgets` - Cost budgets
- `alerts` - CloudWatch alarms

See `docs/evidence/architecture/modules.md` for details.

## Last Updated
[TODO: Update date when architecture changes]
