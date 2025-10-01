#!/bin/bash

# LocalStack testing script for PhotoEditor project
set -e

echo "🧪 Testing PhotoEditor infrastructure with LocalStack..."

# Set LocalStack environment
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Check if LocalStack is running
if ! curl -s http://localhost:4566/_localstack/health > /dev/null; then
    echo "❌ LocalStack is not running. Please run ./scripts/localstack-setup.sh first"
    exit 1
fi

echo "✅ LocalStack is running"

# Test S3 buckets
echo "📦 Testing S3 buckets..."
aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL || echo "No buckets found yet"

# Test DynamoDB tables
echo "🗄️  Testing DynamoDB tables..."
aws dynamodb list-tables --endpoint-url=$AWS_ENDPOINT_URL || echo "No tables found yet"

# Test Lambda functions
echo "⚡ Testing Lambda functions..."
aws lambda list-functions --endpoint-url=$AWS_ENDPOINT_URL || echo "No functions found yet"

# Test SQS queues
echo "📬 Testing SQS queues..."
aws sqs list-queues --endpoint-url=$AWS_ENDPOINT_URL || echo "No queues found yet"

# Test SNS topics
echo "📢 Testing SNS topics..."
aws sns list-topics --endpoint-url=$AWS_ENDPOINT_URL || echo "No topics found yet"

# Test API Gateway
echo "🌐 Testing API Gateway..."
aws apigateway get-rest-apis --endpoint-url=$AWS_ENDPOINT_URL || echo "No APIs found yet"

# Test SSM parameters
echo "🔐 Testing SSM parameters..."
aws ssm describe-parameters --endpoint-url=$AWS_ENDPOINT_URL || echo "No parameters found yet"

echo ""
echo "🎯 Integration tests:"

# Test S3 operations
echo "📤 Testing S3 upload..."
echo "test content" > /tmp/test-file.txt
BUCKET_NAME=$(aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL | grep photoeditor | head -n1 | awk '{print $3}' || echo "")

if [ -n "$BUCKET_NAME" ]; then
    aws s3 cp /tmp/test-file.txt s3://$BUCKET_NAME/test/test-file.txt --endpoint-url=$AWS_ENDPOINT_URL
    echo "✅ S3 upload successful"

    # Test S3 download
    aws s3 cp s3://$BUCKET_NAME/test/test-file.txt /tmp/downloaded-file.txt --endpoint-url=$AWS_ENDPOINT_URL
    if cmp -s /tmp/test-file.txt /tmp/downloaded-file.txt; then
        echo "✅ S3 download successful"
    else
        echo "❌ S3 download failed"
    fi

    # Clean up
    rm -f /tmp/test-file.txt /tmp/downloaded-file.txt
else
    echo "⚠️  No S3 buckets found for testing"
fi

# Test DynamoDB operations
TABLE_NAME=$(aws dynamodb list-tables --endpoint-url=$AWS_ENDPOINT_URL --query 'TableNames[0]' --output text 2>/dev/null || echo "")

if [ -n "$TABLE_NAME" ] && [ "$TABLE_NAME" != "None" ]; then
    echo "🗄️  Testing DynamoDB operations..."

    # Put item
    aws dynamodb put-item \
        --endpoint-url=$AWS_ENDPOINT_URL \
        --table-name "$TABLE_NAME" \
        --item '{
            "id": {"S": "test-job-123"},
            "status": {"S": "pending"},
            "created_at": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}
        }' > /dev/null

    echo "✅ DynamoDB put-item successful"

    # Get item
    RESULT=$(aws dynamodb get-item \
        --endpoint-url=$AWS_ENDPOINT_URL \
        --table-name "$TABLE_NAME" \
        --key '{"id": {"S": "test-job-123"}}' \
        --query 'Item.status.S' \
        --output text 2>/dev/null || echo "")

    if [ "$RESULT" = "pending" ]; then
        echo "✅ DynamoDB get-item successful"
    else
        echo "❌ DynamoDB get-item failed"
    fi
else
    echo "⚠️  No DynamoDB tables found for testing"
fi

echo ""
echo "🏁 LocalStack testing complete!"
echo ""
echo "📊 Resource Summary:"
aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL | wc -l | xargs echo "S3 Buckets:"
aws dynamodb list-tables --endpoint-url=$AWS_ENDPOINT_URL --query 'length(TableNames)' --output text | xargs echo "DynamoDB Tables:"
aws lambda list-functions --endpoint-url=$AWS_ENDPOINT_URL --query 'length(Functions)' --output text | xargs echo "Lambda Functions:"
aws sqs list-queues --endpoint-url=$AWS_ENDPOINT_URL --query 'length(QueueUrls)' --output text | xargs echo "SQS Queues:"