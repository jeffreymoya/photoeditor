#!/bin/bash

# LocalStack setup script for PhotoEditor project
set -e

echo "🚀 Setting up LocalStack for PhotoEditor..."

# Create necessary directories
mkdir -p tmp/localstack
mkdir -p backend/dist/lambdas

# Start LocalStack
echo "📦 Starting LocalStack..."
docker compose -f docker-compose.localstack.yml up -d

# Wait for LocalStack to be ready
echo "⏳ Waiting for LocalStack to be ready..."
timeout 60 bash -c 'until curl -s http://localhost:4566/_localstack/health | grep -q "\"s3\": \"available\""; do sleep 2; done'

echo "✅ LocalStack is ready!"

# Build Lambda functions
echo "🔨 Building Lambda functions..."
cd backend
npm run build:lambdas
cd ..

# Initialize Terraform with LocalStack provider
echo "🏗️  Initializing Terraform for LocalStack..."
cd infrastructure

# Backup original files and use LocalStack versions
if [ ! -f "main.tf.backup" ]; then
    cp main.tf main.tf.backup
    cp provider-localstack.tf main.tf
fi

# Initialize and apply
terraform init -reconfigure
terraform plan -var-file="terraform.tfvars.localstack" -out=localstack.tfplan
terraform apply localstack.tfplan

cd ..

echo "🎉 LocalStack setup complete!"
echo ""
echo "📋 Useful commands:"
echo "  - View LocalStack logs: docker compose -f docker-compose.localstack.yml logs -f"
echo "  - Stop LocalStack: docker compose -f docker-compose.localstack.yml down"
echo "  - LocalStack Web UI: http://localhost:4566"
echo "  - Health check: curl http://localhost:4566/_localstack/health"
echo ""
echo "🔧 AWS CLI commands for LocalStack:"
echo "  export AWS_ENDPOINT_URL=http://localhost:4566"
echo "  export AWS_ACCESS_KEY_ID=test"
echo "  export AWS_SECRET_ACCESS_KEY=test"
echo "  export AWS_DEFAULT_REGION=us-east-1"