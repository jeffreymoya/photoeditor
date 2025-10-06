# ADR-0006: Secrets Management Strategy

**Status:** Accepted
**Date:** 2025-10-05
**Author:** Platform Team
**Related:** STANDARDS.md (line 41), docs/rubric.md (lines 220-221)

## Context

The PhotoEditor platform requires secure storage and rotation of secrets including:
- Provider API keys (Gemini, Seedream)
- Database credentials (future RDS if needed)
- Third-party integrations (FCM server keys)
- Encryption keys (KMS CMKs)
- Mobile app secrets (API keys, push notification certificates)

Per STANDARDS.md line 41, all secrets must use SSM SecureString or Secrets Manager with rotation, and any long-lived keys in code/CI is a hard fail.

## Decision

We will use a **hybrid approach**:

1. **AWS Systems Manager Parameter Store (SSM)** for configuration and semi-static secrets
2. **AWS Secrets Manager** for secrets requiring automatic rotation
3. **AWS KMS** for encryption keys and CMKs
4. **GitHub OIDC** for CI/CD authentication (no long-lived AWS credentials)

### SSM Parameter Store (Primary)

**Use Cases:**
- Provider API keys (manual rotation, low frequency)
- Feature flags and environment configuration
- Lambda environment variable overrides
- Provider strategy selection (`/photoeditor/{env}/provider/strategy`)

**Structure:**
```
/photoeditor/{env}/provider/gemini-api-key       (SecureString, KMS encrypted)
/photoeditor/{env}/provider/seedream-api-key     (SecureString, KMS encrypted)
/photoeditor/{env}/fcm/server-key                (SecureString, KMS encrypted)
/photoeditor/{env}/provider/strategy             (String, not sensitive)
/photoeditor/{env}/features/batch-processing     (String, feature flag)
```

**Advantages:**
- Lower cost ($0.05 per 10k API calls vs Secrets Manager $0.40/secret/month)
- Integrated with Lambda environment variables
- Version history for configuration changes
- Fine-grained IAM access control

**Access Pattern:**
```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

export async function getSecret(name: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });

  const response = await ssm.send(command);
  return response.Parameter?.Value || '';
}

// Usage in Lambda
const apiKey = await getSecret(`/photoeditor/${process.env.ENV}/provider/gemini-api-key`);
```

### Secrets Manager (Rotation-Required)

**Use Cases:**
- Database passwords (future RDS/Aurora)
- OAuth tokens requiring auto-rotation
- API keys with rotation APIs

**Advantages:**
- Automatic rotation via Lambda function
- Cross-region replication
- Built-in versioning and staging labels (AWSCURRENT, AWSPREVIOUS)

**Example (Future RDS):**
```json
{
  "name": "/photoeditor/prod/db/credentials",
  "rotation_enabled": true,
  "rotation_lambda_arn": "arn:aws:lambda:us-east-1:123456789012:function:photoeditor-prod-secret-rotation",
  "rotation_days": 30
}
```

### KMS CMKs

**Use Cases:**
- S3 bucket encryption (final bucket)
- DynamoDB encryption at rest
- SSM SecureString parameter encryption
- SQS queue encryption

**Key Hierarchy:**
```
photoeditor-{env}-primary-cmk       (Multi-purpose, S3 final bucket, DynamoDB)
photoeditor-{env}-temp-cmk          (Temp S3 bucket, short-lived data)
```

**Key Rotation:**
- Automatic rotation enabled (yearly)
- Manual rotation process documented for emergency key compromise

### GitHub OIDC (CI/CD)

**No Long-Lived Credentials:**
- GitHub Actions authenticates via OIDC provider
- Assumes IAM role with least-privilege policy
- Scoped to specific repos and branches

**Terraform Configuration:**
```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com",
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1"
  ]
}

resource "aws_iam_role" "github_actions" {
  name = "photoeditor-github-actions-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:jeffreymoya/photoeditor:*"
          }
        }
      }
    ]
  })
}
```

## Alternatives Considered

### 1. Secrets Manager Only

**Pros:**
- Unified secret storage
- Automatic rotation out of the box
- Cross-region replication

**Cons:**
- Higher cost ($0.40/secret/month + $0.05 per 10k API calls)
- Overkill for static configuration and feature flags
- More complex for non-rotating secrets

**Decision:** Rejected due to cost and complexity for our use case.

### 2. Environment Variables (Hardcoded)

**Pros:**
- Simple Lambda configuration
- Fast access (no API call)

**Cons:**
- Violates STANDARDS.md line 41 (hard fail)
- No rotation capability
- Visible in Lambda console to anyone with read access
- Version control risk (leaked secrets)

**Decision:** Rejected. Non-compliant.

### 3. HashiCorp Vault

**Pros:**
- Advanced secret management
- Dynamic secrets
- Audit logging

**Cons:**
- Additional infrastructure to maintain
- Increased cost (EC2 instances or Vault Cloud)
- Complexity for small-scale secrets requirements
- Redundant with AWS native solutions

**Decision:** Rejected. Overengineering for current scale.

### 4. S3 Encrypted Objects

**Pros:**
- Familiar storage mechanism

**Cons:**
- No built-in rotation
- Coarse-grained access control
- Not designed for secrets
- Requires custom tooling

**Decision:** Rejected. Not purpose-built for secrets.

## Consequences

### Positive

- **Cost-effective:** SSM Parameter Store for most secrets (~$5/month vs ~$40/month with Secrets Manager only)
- **Compliant:** Meets STANDARDS.md line 41 requirements (no long-lived keys in code/CI)
- **Secure:** KMS encryption, IAM least-privilege, automatic rotation where needed
- **Developer-friendly:** Simple API, Lambda integration, versioning
- **Auditable:** CloudTrail logs all parameter access

### Negative

- **Manual rotation:** Provider API keys require manual rotation (acceptable trade-off)
- **Hybrid complexity:** Two systems (SSM + Secrets Manager) instead of one
- **Migration effort:** If future need requires Secrets Manager for all, migration needed

### Mitigation

- Document rotation procedures in runbooks
- Set calendar reminders for manual rotation (quarterly)
- CloudWatch alarm if parameter version >90 days old
- Terraform module abstracts SSM/Secrets Manager differences

## Implementation

### Terraform Module

```hcl
module "secrets" {
  source = "./modules/secrets"

  environment = var.environment
  secrets = {
    gemini-api-key = {
      type        = "ssm"
      kms_key_id  = aws_kms_key.primary.id
      description = "Gemini API key for image analysis"
    }
    seedream-api-key = {
      type        = "ssm"
      kms_key_id  = aws_kms_key.primary.id
      description = "Seedream API key for image editing"
    }
  }

  tags = local.common_tags
}
```

### Lambda Access (Least Privilege)

```hcl
resource "aws_iam_role_policy" "lambda_secrets_read" {
  name = "secrets-read"
  role = aws_iam_role.lambda_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/photoeditor/${var.environment}/provider/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = [
          aws_kms_key.primary.arn
        ]
      }
    ]
  })
}
```

### Rotation Runbook

**Provider API Key Rotation (Quarterly):**

1. Generate new API key in provider console
2. Store new key in SSM with temporary name:
   ```bash
   aws ssm put-parameter \
     --name /photoeditor/prod/provider/gemini-api-key-new \
     --value "NEW_KEY" \
     --type SecureString \
     --kms-key-id alias/photoeditor-prod-primary-cmk
   ```
3. Update Lambda to read from `-new` parameter
4. Deploy and validate
5. Swap parameter names (atomic update):
   ```bash
   aws ssm put-parameter \
     --name /photoeditor/prod/provider/gemini-api-key \
     --value "NEW_KEY" \
     --type SecureString \
     --kms-key-id alias/photoeditor-prod-primary-cmk \
     --overwrite
   ```
6. Delete `-new` parameter
7. Revoke old API key in provider console

### Monitoring

**CloudWatch Alarm (Stale Parameters):**

```hcl
resource "aws_cloudwatch_metric_alarm" "stale_parameter" {
  alarm_name          = "photoeditor-${var.environment}-stale-secrets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ParameterAge"
  namespace           = "PhotoEditor/Secrets"
  period              = "86400"  # Daily check
  statistic           = "Maximum"
  threshold           = "90"     # 90 days
  alarm_description   = "Secret parameter has not been rotated in >90 days"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
```

## References

- STANDARDS.md (line 41: Secrets hard-fail control)
- docs/rubric.md (lines 220-221: Secrets via SSM/Secrets Manager)
- [Provider Swap Runbook](../docs/ops/runbooks/provider-swap.md)
- [AWS SSM Parameter Store Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)

## Review and Updates

- **Review Cadence:** Quarterly (with parameter rotation)
- **Ownership:** Platform Team
- **Next Review:** 2026-01-05
