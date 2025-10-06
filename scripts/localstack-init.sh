#!/bin/bash
# LocalStack initialization script - seeds SSM/SSO stubs and resources
# This script runs automatically when LocalStack is ready (via init hook)

set -e

echo "🔧 Initializing LocalStack resources..."

# AWS endpoint and credentials for LocalStack
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Function to create SSM parameter (idempotent)
create_ssm_param() {
    local name=$1
    local value=$2
    local type=${3:-String}

    if aws ssm get-parameter --name "$name" --endpoint-url=$AWS_ENDPOINT_URL >/dev/null 2>&1; then
        echo "✓ SSM parameter $name already exists"
    else
        aws ssm put-parameter \
            --name "$name" \
            --value "$value" \
            --type "$type" \
            --endpoint-url=$AWS_ENDPOINT_URL \
            --no-cli-pager >/dev/null 2>&1
        echo "✓ Created SSM parameter: $name"
    fi
}

# Function to create S3 bucket (idempotent)
create_s3_bucket() {
    local bucket=$1

    if aws s3 ls "s3://$bucket" --endpoint-url=$AWS_ENDPOINT_URL >/dev/null 2>&1; then
        echo "✓ S3 bucket $bucket already exists"
    else
        aws s3 mb "s3://$bucket" --endpoint-url=$AWS_ENDPOINT_URL --no-cli-pager >/dev/null 2>&1
        echo "✓ Created S3 bucket: $bucket"
    fi
}

# Create SSM stub secrets for offline development
echo "📝 Creating SSM stub parameters..."
create_ssm_param "/photoeditor/dev/api-key" "stub-api-key-12345" "SecureString"
create_ssm_param "/photoeditor/dev/gemini-api-key" "stub-gemini-key-67890" "SecureString"
create_ssm_param "/photoeditor/dev/seedream-api-key" "stub-seedream-key-abcde" "SecureString"
create_ssm_param "/photoeditor/dev/provider-strategy" "stub" "String"
create_ssm_param "/photoeditor/dev/cors-origins" "http://localhost:19000,http://localhost:19006" "String"
create_ssm_param "/photoeditor/dev/jwt-secret" "stub-jwt-secret-localdev" "SecureString"

# Create SSO stub parameters (simulating AWS SSO/Identity Center)
echo "🔐 Creating SSO stub parameters..."
create_ssm_param "/photoeditor/dev/sso/account-id" "000000000000" "String"
create_ssm_param "/photoeditor/dev/sso/role-arn" "arn:aws:iam::000000000000:role/PhotoEditorDevRole" "String"
create_ssm_param "/photoeditor/dev/sso/session-duration" "3600" "String"

# Create deterministic S3 buckets for testing
echo "📦 Creating S3 buckets..."
create_s3_bucket "photoeditor-dev-temp-uploads"
create_s3_bucket "photoeditor-dev-final-assets"
create_s3_bucket "photoeditor-dev-logs"

# Create KMS key for encryption (stub)
echo "🔑 Creating KMS key..."
if aws kms list-keys --endpoint-url=$AWS_ENDPOINT_URL --no-cli-pager 2>/dev/null | grep -q "KeyId"; then
    echo "✓ KMS keys already exist"
else
    KMS_KEY_ID=$(aws kms create-key \
        --description "PhotoEditor LocalStack stub key" \
        --endpoint-url=$AWS_ENDPOINT_URL \
        --no-cli-pager \
        --query 'KeyMetadata.KeyId' \
        --output text 2>/dev/null || echo "")

    if [ -n "$KMS_KEY_ID" ]; then
        aws kms create-alias \
            --alias-name "alias/photoeditor-dev-stub" \
            --target-key-id "$KMS_KEY_ID" \
            --endpoint-url=$AWS_ENDPOINT_URL \
            --no-cli-pager >/dev/null 2>&1
        echo "✓ Created KMS key: $KMS_KEY_ID"
        create_ssm_param "/photoeditor/dev/kms-key-id" "$KMS_KEY_ID" "String"
    fi
fi

echo "✅ LocalStack initialization complete!"
echo ""
echo "📋 Seeded resources:"
echo "  - SSM stub secrets (API keys, JWT, provider strategy)"
echo "  - SSO stub parameters (account ID, role ARN)"
echo "  - S3 buckets (temp, final, logs)"
echo "  - KMS key alias (photoeditor-dev-stub)"
echo ""
echo "🔍 Verify with:"
echo "  aws ssm describe-parameters --endpoint-url=http://localhost:4566"
echo "  aws s3 ls --endpoint-url=http://localhost:4566"
