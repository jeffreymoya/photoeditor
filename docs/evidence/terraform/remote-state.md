# Terraform Remote State Configuration

## Backend Configuration

### S3 Backend with DynamoDB Locking

**File**: `infrastructure/backend.tf` or configured in root module

```hcl
terraform {
  backend "s3" {
    bucket         = "[PROJECT]-terraform-state"
    key            = "env/${terraform.workspace}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "[PROJECT]-terraform-locks"
    encrypt        = true

    # Optional: KMS encryption
    kms_key_id = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
  }
}
```

### State Bucket Configuration

**Bucket Name**: `[PROJECT]-terraform-state`

**Security Features**:
- Encryption: SSE-S3 or SSE-KMS
- Versioning: Enabled
- Public Access: Blocked
- Lifecycle: Retain old versions for 90 days

**Terraform Configuration**:
```hcl
resource "aws_s3_bucket" "terraform_state" {
  bucket = "${var.project}-terraform-state"

  tags = {
    Name        = "Terraform State Bucket"
    Environment = "shared"
    Project     = var.project
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
      # Or use KMS:
      # sse_algorithm     = "aws:kms"
      # kms_master_key_id = aws_kms_key.terraform.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "archive-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}
```

### DynamoDB Lock Table

**Table Name**: `[PROJECT]-terraform-locks`

**Configuration**:
- Primary Key: `LockID` (String)
- Billing Mode: PAY_PER_REQUEST (on-demand)
- Encryption: Enabled (AWS managed key)

**Terraform Configuration**:
```hcl
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "${var.project}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "Terraform State Locks"
    Environment = "shared"
    Project     = var.project
  }
}
```

## Workspace Strategy

### Per-Environment Workspaces
```bash
# List workspaces
terraform workspace list

# Create workspace
terraform workspace new dev
terraform workspace new stage
terraform workspace new prod

# Select workspace
terraform workspace select dev
```

### State File Structure
```
s3://[PROJECT]-terraform-state/
├── env/
│   ├── dev/
│   │   └── terraform.tfstate
│   ├── stage/
│   │   └── terraform.tfstate
│   └── prod/
│       └── terraform.tfstate
```

## Initialization

### First-Time Setup
```bash
# 1. Create state bucket and lock table (manual or separate Terraform)
terraform init -backend=false
terraform apply -target=aws_s3_bucket.terraform_state -target=aws_dynamodb_table.terraform_locks

# 2. Configure backend
terraform init -backend-config=backend.hcl

# 3. Migrate state (if migrating from local)
terraform init -migrate-state
```

### Backend Configuration File
**File**: `infrastructure/backend.hcl` (gitignored)

```hcl
bucket         = "photoeditor-terraform-state"
key            = "env/dev/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "photoeditor-terraform-locks"
encrypt        = true
```

## IAM Permissions

### Terraform Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning"
      ],
      "Resource": "arn:aws:s3:::photoeditor-terraform-state"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::photoeditor-terraform-state/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/photoeditor-terraform-locks"
    }
  ]
}
```

## Verification

### Check Remote State
```bash
# Verify backend configuration
terraform init -backend-config=backend.hcl

# Show current state location
terraform show

# List workspaces
terraform workspace list
```

### Verify Locking
```bash
# In one terminal, start a long-running operation
terraform plan

# In another terminal, try to run another operation (should be blocked)
terraform plan
# Expected: Error acquiring the state lock
```

### Check State Bucket
```bash
# List state files
aws s3 ls s3://photoeditor-terraform-state/env/ --recursive

# Verify versioning
aws s3api get-bucket-versioning --bucket photoeditor-terraform-state

# Verify encryption
aws s3api get-bucket-encryption --bucket photoeditor-terraform-state
```

### Check Lock Table
```bash
# Describe lock table
aws dynamodb describe-table --table-name photoeditor-terraform-locks

# Check for active locks
aws dynamodb scan --table-name photoeditor-terraform-locks
```

## State Management Best Practices

### ✅ Do
- Use remote state from day one
- Enable versioning on state bucket
- Enable encryption (SSE-S3 minimum, SSE-KMS preferred)
- Use DynamoDB locking to prevent concurrent modifications
- Use workspaces to separate environments
- Regularly backup state files
- Restrict access to state bucket (contains sensitive data)

### ❌ Don't
- Store state in git
- Share state files manually
- Run `terraform apply` without locking
- Modify state files manually (use `terraform state` commands)
- Use wildcards in state access policies
- Run Terraform operations on same workspace concurrently

## State Recovery

### Restore from Version
```bash
# List versions
aws s3api list-object-versions --bucket photoeditor-terraform-state --prefix env/dev/terraform.tfstate

# Download specific version
aws s3api get-object --bucket photoeditor-terraform-state --key env/dev/terraform.tfstate --version-id VERSION_ID terraform.tfstate.backup

# Replace current state (careful!)
terraform state push terraform.tfstate.backup
```

### Force Unlock (Emergency)
```bash
# Get lock ID from error message, then:
terraform force-unlock LOCK_ID
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v2
  with:
    role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-actions-terraform
    aws-region: us-east-1

- name: Terraform Init
  run: |
    cd infrastructure
    terraform init -backend-config=backend.hcl

- name: Terraform Plan
  run: |
    cd infrastructure
    terraform workspace select ${{ github.event.inputs.environment }}
    terraform plan -out=tfplan
```

## Last Updated
[TODO: Add date]

## Evidence
- [ ] Screenshot: S3 bucket configuration (versioning, encryption)
- [ ] Screenshot: DynamoDB lock table
- [ ] Backend configuration file (sanitized)
- [ ] Workspace list output
