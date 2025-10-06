#!/bin/bash
# LocalStack setup script for PhotoEditor project
# Deterministic startup with health checks and seeded resources

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 Setting up LocalStack for PhotoEditor..."

# Create necessary directories
mkdir -p "$PROJECT_ROOT/tmp/localstack"
mkdir -p "$PROJECT_ROOT/backend/dist/lambdas"

# Start LocalStack
echo "📦 Starting LocalStack..."
docker compose -f "$PROJECT_ROOT/docker-compose.localstack.yml" up -d

# Wait for LocalStack to be healthy
echo "⏳ Waiting for LocalStack to be healthy..."
timeout 90 bash -c 'until docker compose -f '"$PROJECT_ROOT"'/docker-compose.localstack.yml ps localstack | grep -q "healthy"; do sleep 2; echo -n "."; done'
echo ""

# Verify health endpoint
echo "🔍 Verifying LocalStack health..."
if ! curl -sf http://localhost:4566/_localstack/health | grep -q '"s3": "available"'; then
    echo "❌ LocalStack health check failed"
    docker compose -f "$PROJECT_ROOT/docker-compose.localstack.yml" logs localstack
    exit 1
fi

echo "✅ LocalStack is ready and healthy!"

# Wait a moment for init script to complete
sleep 2

# Verify seeded resources
echo "🔍 Verifying seeded resources..."
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Check SSM parameters
SSM_COUNT=$(aws ssm describe-parameters --endpoint-url=$AWS_ENDPOINT_URL --no-cli-pager --query 'length(Parameters)' --output text 2>/dev/null || echo "0")
echo "  - SSM parameters seeded: $SSM_COUNT"

# Check S3 buckets
S3_COUNT=$(aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL --no-cli-pager 2>/dev/null | wc -l || echo "0")
echo "  - S3 buckets created: $S3_COUNT"

# Build Lambda functions if needed
if [ ! -d "$PROJECT_ROOT/backend/dist/lambdas" ] || [ -z "$(ls -A "$PROJECT_ROOT/backend/dist/lambdas" 2>/dev/null)" ]; then
    echo "🔨 Building Lambda functions..."
    npm run build:lambdas --prefix "$PROJECT_ROOT/backend"
else
    echo "✓ Lambda functions already built"
fi

# Initialize Terraform with LocalStack provider (if infrastructure exists)
if [ -d "$PROJECT_ROOT/infrastructure" ]; then
    echo "🏗️  Initializing Terraform for LocalStack..."
    cd "$PROJECT_ROOT/infrastructure"

    # Backup original files and use LocalStack versions if applicable
    if [ -f "provider-localstack.tf" ] && [ ! -f "main.tf.backup" ]; then
        cp main.tf main.tf.backup
        cp provider-localstack.tf main.tf
    fi

    # Initialize and apply
    terraform init -reconfigure
    terraform plan -var-file="terraform.tfvars.localstack" -out=localstack.tfplan
    terraform apply -auto-approve localstack.tfplan

    cd "$PROJECT_ROOT"
else
    echo "ℹ️  No infrastructure directory found, skipping Terraform"
fi

echo ""
echo "🎉 LocalStack setup complete!"
echo ""
echo "📋 Useful commands:"
echo "  - View LocalStack logs: docker compose -f docker-compose.localstack.yml logs -f"
echo "  - Stop LocalStack: docker compose -f docker-compose.localstack.yml down"
echo "  - Health check: curl http://localhost:4566/_localstack/health"
echo "  - List SSM params: aws ssm describe-parameters --endpoint-url=http://localhost:4566"
echo "  - List S3 buckets: aws s3 ls --endpoint-url=http://localhost:4566"
echo ""
echo "🔧 AWS CLI environment (already set):"
echo "  export AWS_ENDPOINT_URL=http://localhost:4566"
echo "  export AWS_ACCESS_KEY_ID=test"
echo "  export AWS_SECRET_ACCESS_KEY=test"
echo "  export AWS_DEFAULT_REGION=us-east-1"