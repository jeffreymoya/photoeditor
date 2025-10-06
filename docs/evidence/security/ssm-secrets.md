# SSM Parameter Store & Secrets Manager Evidence

## Parameter Structure

### Environment-Scoped Parameters
All parameters use the pattern: `/{PROJECT}-{ENV}/<category>/<name>`

Example hierarchy:
```
/photoeditor-dev/
├── ai/
│   ├── provider              # Values: bedrock|openai|azure-openai
│   ├── gemini-api-key        # SecureString
│   └── openai-api-key        # SecureString
├── notifications/
│   └── fcm-server-key        # SecureString
├── storage/
│   └── kms-key-id            # String
└── config/
    └── log-level             # String
```

### Parameter Types

#### SecureString (Encrypted)
- **Use for**: API keys, tokens, passwords, sensitive config
- **Encryption**: AWS KMS (default or custom CMK)
- **Examples**:
  - AI provider API keys
  - FCM server keys
  - Database passwords (if used)
  - Third-party service tokens

#### String (Plaintext)
- **Use for**: Non-sensitive configuration
- **Examples**:
  - Feature flags
  - Log levels
  - Public endpoint URLs
  - Region names

## Parameter List

### AI Providers
| Parameter | Type | Description | Example Value |
|-----------|------|-------------|---------------|
| `/{ENV}/ai/provider` | String | Active AI provider | `bedrock` |
| `/{ENV}/ai/gemini-api-key` | SecureString | Google Gemini API key | `***` |
| `/{ENV}/ai/openai-api-key` | SecureString | OpenAI API key | `***` |

### Notifications
| Parameter | Type | Description | Example Value |
|-----------|------|-------------|---------------|
| `/{ENV}/notifications/fcm-server-key` | SecureString | Firebase Cloud Messaging key | `***` |

### Storage
| Parameter | Type | Description | Example Value |
|-----------|------|-------------|---------------|
| `/{ENV}/storage/kms-key-id` | String | KMS key ID for S3 encryption | `arn:aws:kms:...` |
| `/{ENV}/storage/temp-bucket` | String | Temp S3 bucket name | `project-dev-temp` |
| `/{ENV}/storage/final-bucket` | String | Final S3 bucket name | `project-dev-final` |

### Configuration
| Parameter | Type | Description | Example Value |
|-----------|------|-------------|---------------|
| `/{ENV}/config/log-level` | String | Lambda log level | `INFO` |

## Secrets Manager (Rotation Required)

Use Secrets Manager only when automatic rotation is needed:
- Database credentials (RDS integration)
- OAuth tokens with refresh capabilities

Currently: **Not used** - all secrets use SSM SecureString.

## Verification

### List All Parameters
```bash
aws ssm get-parameters-by-path --path "/photoeditor-dev" --recursive --output table
```

### Verify Encryption
```bash
# Check that sensitive parameters are SecureString type
aws ssm describe-parameters --filters "Key=Name,Values=/photoeditor-dev/ai/" --query 'Parameters[*].[Name,Type]' --output table
```

Expected: All API keys and sensitive values show `Type=SecureString`

### Access from Lambda
```typescript
// In ConfigService
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const client = new SSMClient({ region: process.env.AWS_REGION });

export async function getParameter(name: string, withDecryption = true): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: withDecryption
  });

  const response = await client.send(command);
  return response.Parameter?.Value ?? '';
}
```

## IAM Permissions

### Lambda Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/photoeditor-ENV/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.REGION.amazonaws.com"
        }
      }
    }
  ]
}
```

## Terraform Configuration

### Parameter Creation
```hcl
resource "aws_ssm_parameter" "ai_provider" {
  name  = "/${var.project}-${var.environment}/ai/provider"
  type  = "String"
  value = "bedrock"

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}

resource "aws_ssm_parameter" "gemini_api_key" {
  name  = "/${var.project}-${var.environment}/ai/gemini-api-key"
  type  = "SecureString"
  value = "placeholder" # Update manually or via CI

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}
```

## Security Best Practices

### ✅ Do
- Use SecureString for all secrets and API keys
- Scope parameters per environment
- Use KMS encryption for SecureString parameters
- Set lifecycle `ignore_changes` for secret values in Terraform
- Rotate secrets periodically (manual process documented)
- Use IAM resource scoping to limit parameter access

### ❌ Don't
- Store plaintext secrets in `.env` files
- Commit secrets to git (even encrypted)
- Use long-lived IAM access keys
- Share parameters across environments
- Grant `ssm:*` or `ssm:GetParameter*` on `*` resources

## CI/CD Integration

### Secret Injection
```bash
# In CI/CD pipeline
aws ssm put-parameter \
  --name "/photoeditor-prod/ai/gemini-api-key" \
  --type "SecureString" \
  --value "$GEMINI_API_KEY" \
  --overwrite
```

### Deployment Validation
```bash
# Verify required parameters exist before deployment
required_params=(
  "/photoeditor-${ENV}/ai/provider"
  "/photoeditor-${ENV}/ai/gemini-api-key"
  "/photoeditor-${ENV}/notifications/fcm-server-key"
)

for param in "${required_params[@]}"; do
  aws ssm get-parameter --name "$param" --query 'Parameter.Name' --output text || {
    echo "ERROR: Required parameter $param not found"
    exit 1
  }
done
```

## Last Updated
[TODO: Add date]

## Evidence Files
- [ ] Screenshot: SSM Parameter Store hierarchy
- [ ] Screenshot: Parameter encryption settings (SecureString with KMS)
- [ ] IAM policy showing scoped SSM access
- [ ] No `.env` files with secrets in repository
