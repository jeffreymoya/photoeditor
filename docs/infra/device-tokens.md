# Device Token Infrastructure Runbook

## Overview

This runbook describes the infrastructure provisioning, operation, and troubleshooting procedures for the PhotoEditor mobile push notification device token system.

## Architecture

### Components

1. **DynamoDB Table**: `photoeditor-{env}-device-tokens`
   - Stores Expo push notification tokens
   - Primary key: `userId` (hash), `deviceId` (range)
   - TTL: 90 days (automatic expiry via `expiresAt` attribute)

2. **Lambda Function**: `photoeditor-{env}-device-token`
   - Handler: `backend/src/lambdas/deviceToken.ts`
   - Memory: 128 MB
   - Timeout: 10 seconds
   - Operations: Register, update, deactivate, delete tokens

3. **API Gateway Routes**:
   - `POST /v1/device-tokens` - Register/update device token
   - `DELETE /v1/device-tokens?deviceId={id}` - Deactivate device token

4. **CloudWatch**:
   - Log group: `/aws/lambda/photoeditor-{env}-device-token`
   - Alarms: Lambda errors, DynamoDB throttling, system errors

### Infrastructure as Code

- **Terraform**: `infrastructure/modules/storage/device-tokens.tf` (LocalStack)
- **SST**: `infra/sst/stacks/storage.ts` and `infra/sst/stacks/api.ts` (Cloud)

## Provisioning

### LocalStack Deployment (Development)

```bash
# Navigate to infrastructure directory
cd infrastructure

# Initialize Terraform
terraform init

# Plan changes
terraform plan -out=device-token.tfplan

# Apply infrastructure
terraform apply device-token.tfplan

# Verify table creation
aws dynamodb describe-table \
  --table-name photoeditor-dev-device-tokens \
  --endpoint-url http://localhost:4566

# Test API endpoint
curl -X POST http://localhost:4566/restapis/{api-id}/dev/_user_request_/v1/device-tokens \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-device","expoPushToken":"ExponentPushToken[...]","platform":"ios"}'
```

### Cloud Deployment (Staging/Production)

```bash
# Navigate to SST directory
cd infra/sst

# Deploy to staging
npx sst deploy --stage staging

# Deploy to production
npx sst deploy --stage production

# Verify deployment
aws dynamodb describe-table \
  --table-name photoeditor-{stage}-device-tokens

# Test endpoint
curl -X POST https://{api-id}.execute-api.us-east-1.amazonaws.com/v1/device-tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"deviceId":"test-device","expoPushToken":"ExponentPushToken[...]","platform":"ios"}'
```

## Operations

### Monitoring

#### CloudWatch Dashboards

View device token metrics in the PhotoEditor CloudWatch dashboard:

1. Lambda invocations
2. Lambda errors
3. Lambda duration
4. DynamoDB read/write capacity
5. DynamoDB throttled requests

#### Key Metrics

- **Lambda Errors**: Should be 0 in steady state
- **DynamoDB Throttling**: Should be 0 (on-demand scaling)
- **API Gateway 4XX**: Acceptable if <5% (client validation errors)
- **API Gateway 5XX**: Should be 0

#### Alarms

| Alarm | Threshold | Action |
|-------|-----------|--------|
| DeviceTokenLambdaErrors | >0 in 5 min | Investigate logs |
| DeviceTokenReadThrottle | >10 in 5 min | Check capacity |
| DeviceTokenWriteThrottle | >10 in 5 min | Check capacity |
| DeviceTokenSystemErrors | >0 in 5 min | AWS service issue |

### Viewing Logs

```bash
# Tail Lambda logs (LocalStack)
docker compose -f docker-compose.localstack.yml logs -f localstack | grep deviceToken

# Tail Lambda logs (Cloud)
aws logs tail /aws/lambda/photoeditor-{stage}-device-token --follow

# Query specific error
aws logs filter-log-events \
  --log-group-name /aws/lambda/photoeditor-{stage}-device-token \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000

# Export logs for analysis
aws logs start-query \
  --log-group-name /aws/lambda/photoeditor-{stage}-device-token \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ConditionalCheckFailed/'
```

### Querying Device Tokens

```bash
# Get all devices for a user
aws dynamodb query \
  --table-name photoeditor-{stage}-device-tokens \
  --key-condition-expression "userId = :userId" \
  --expression-attribute-values '{":userId":{"S":"user-123"}}'

# Get specific device token
aws dynamodb get-item \
  --table-name photoeditor-{stage}-device-tokens \
  --key '{"userId":{"S":"user-123"},"deviceId":{"S":"device-abc"}}'

# Count active tokens
aws dynamodb scan \
  --table-name photoeditor-{stage}-device-tokens \
  --filter-expression "isActive = :true" \
  --expression-attribute-values '{":true":{"BOOL":true}}' \
  --select COUNT
```

### Manual Token Cleanup

```bash
# Deactivate expired tokens (manual cleanup if TTL not working)
aws lambda invoke \
  --function-name photoeditor-{stage}-device-token \
  --payload '{"httpMethod":"DELETE","queryStringParameters":{"deviceId":"device-abc"},"requestContext":{"authorizer":{"claims":{"sub":"user-123"}}}}' \
  response.json

# Bulk deactivate via script
for deviceId in $(cat expired-devices.txt); do
  aws dynamodb update-item \
    --table-name photoeditor-{stage}-device-tokens \
    --key "{\"userId\":{\"S\":\"${userId}\"},\"deviceId\":{\"S\":\"${deviceId}\"}}" \
    --update-expression "SET isActive = :false" \
    --expression-attribute-values '{":false":{"BOOL":false}}'
done
```

## Troubleshooting

### Issue: Device Token Registration Failing

**Symptoms**: Mobile app returns 500 error on token registration

**Investigation**:
1. Check Lambda logs for errors
2. Verify DynamoDB table exists and is active
3. Check IAM permissions on Lambda execution role
4. Verify KMS key policy allows Lambda to use key

**Resolution**:
```bash
# Verify table status
aws dynamodb describe-table --table-name photoeditor-{stage}-device-tokens | jq .Table.TableStatus

# Check Lambda IAM policy
aws iam get-role-policy \
  --role-name photoeditor-{stage}-lambda-execution-role \
  --policy-name photoeditor-{stage}-lambda-policy

# Test Lambda manually
aws lambda invoke \
  --function-name photoeditor-{stage}-device-token \
  --payload '{"httpMethod":"POST","body":"{\"deviceId\":\"test\",\"expoPushToken\":\"ExponentPushToken[test]\",\"platform\":\"ios\"}","requestContext":{"authorizer":{"claims":{"sub":"test-user"}}}}' \
  response.json && cat response.json
```

### Issue: Notifications Not Received

**Symptoms**: Jobs complete but mobile devices don't receive push notifications

**Investigation**:
1. Verify device token is active in DynamoDB
2. Check token hasn't expired (expiresAt)
3. Verify expoPushToken format is correct
4. Check SNS notification logs

**Resolution**:
```bash
# Query device token
aws dynamodb get-item \
  --table-name photoeditor-{stage}-device-tokens \
  --key '{"userId":{"S":"user-123"},"deviceId":{"S":"device-abc"}}' | jq

# Verify token is active and not expired
# isActive should be true
# expiresAt should be > current time

# Check SNS delivery logs
aws logs filter-log-events \
  --log-group-name /aws/sns/{region}/{account-id}/photoeditor-{stage}-notifications/Failure \
  --filter-pattern "device-abc"
```

### Issue: DynamoDB Throttling

**Symptoms**: ConditionalCheckFailedException or ProvisionedThroughputExceededException

**Investigation**:
1. Check CloudWatch metrics for throttled requests
2. Review access patterns (are there hot partitions?)
3. Check if billing mode is on-demand

**Resolution**:
```bash
# Check table capacity mode
aws dynamodb describe-table \
  --table-name photoeditor-{stage}-device-tokens | jq .Table.BillingModeSummary

# If provisioned, switch to on-demand
aws dynamodb update-table \
  --table-name photoeditor-{stage}-device-tokens \
  --billing-mode PAY_PER_REQUEST

# Check for hot partitions
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=photoeditor-{stage}-device-tokens \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### Issue: Stale Tokens Accumulating

**Symptoms**: Table size growing, old tokens not being cleaned up

**Investigation**:
1. Verify TTL is enabled on table
2. Check expiresAt attribute is set on all items
3. Allow 24-48 hours for DynamoDB TTL to process

**Resolution**:
```bash
# Check TTL status
aws dynamodb describe-time-to-live \
  --table-name photoeditor-{stage}-device-tokens

# If disabled, enable TTL
aws dynamodb update-time-to-live \
  --table-name photoeditor-{stage}-device-tokens \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt"

# Verify items have expiresAt set
aws dynamodb scan \
  --table-name photoeditor-{stage}-device-tokens \
  --filter-expression "attribute_not_exists(expiresAt)" \
  --select COUNT

# Manual cleanup if needed (see Manual Token Cleanup above)
```

### Issue: API Gateway 429 (Too Many Requests)

**Symptoms**: Mobile app receives 429 errors during registration

**Investigation**:
1. Check API Gateway throttling limits
2. Review CloudWatch metrics for throttled requests
3. Identify if specific user or device is causing spike

**Resolution**:
```bash
# Check API Gateway throttling settings
aws apigateway get-stage \
  --rest-api-id {api-id} \
  --stage-name {stage} | jq .methodSettings

# Increase throttling limits (temporary)
aws apigateway update-stage \
  --rest-api-id {api-id} \
  --stage-name {stage} \
  --patch-operations \
    op=replace,path=/throttle/rateLimit,value=100 \
    op=replace,path=/throttle/burstLimit,value=200

# Add usage plan with quota (permanent solution)
aws apigateway create-usage-plan \
  --name "device-token-plan-{stage}" \
  --throttle rateLimit=50,burstLimit=100 \
  --quota limit=10000,period=DAY
```

## Maintenance

### Weekly Drift Check

```bash
# Run Terraform plan to check for drift
cd infrastructure
terraform plan -detailed-exitcode

# If drift detected (exit code 2), review changes
terraform show

# If drift is acceptable, update state
terraform apply -auto-approve

# If drift is not acceptable, investigate root cause
# (e.g., manual changes via console)
```

### Monthly Table Cleanup

```bash
# Export inactive tokens older than 30 days
aws dynamodb scan \
  --table-name photoeditor-{stage}-device-tokens \
  --filter-expression "isActive = :false AND updatedAt < :cutoff" \
  --expression-attribute-values '{":false":{"BOOL":false},":cutoff":{"S":"'$(date -d '30 days ago' -u +%Y-%m-%dT%H:%M:%SZ)'"}}' \
  --output json > inactive-tokens.json

# Review and delete if appropriate
# (TTL should handle this automatically, but verify)
```

### Quarterly Cost Review

```bash
# Check DynamoDB costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '3 months ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://dynamodb-filter.json

# DynamoDB filter (dynamodb-filter.json):
{
  "And": [
    {"Dimensions": {"Key": "SERVICE","Values": ["Amazon DynamoDB"]}},
    {"Tags": {"Key": "Project","Values": ["PhotoEditor"]}}
  ]
}
```

## Disaster Recovery

### Point-in-Time Recovery

```bash
# Restore table to specific time (within 35-day window)
aws dynamodb restore-table-to-point-in-time \
  --source-table-name photoeditor-{stage}-device-tokens \
  --target-table-name photoeditor-{stage}-device-tokens-restored \
  --restore-date-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)

# Wait for restore to complete
aws dynamodb wait table-exists \
  --table-name photoeditor-{stage}-device-tokens-restored

# Verify restored data
aws dynamodb scan \
  --table-name photoeditor-{stage}-device-tokens-restored \
  --select COUNT

# If data looks good, swap tables (requires downtime)
# 1. Rename current table
# 2. Rename restored table to production name
# 3. Update Terraform state
```

### Backup and Export

```bash
# Create on-demand backup
aws dynamodb create-backup \
  --table-name photoeditor-{stage}-device-tokens \
  --backup-name "device-tokens-manual-$(date +%Y%m%d-%H%M%S)"

# Export to S3 (for analytics or migration)
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:{region}:{account}:table/photoeditor-{stage}-device-tokens \
  --s3-bucket photoeditor-{stage}-backups \
  --s3-prefix device-tokens/$(date +%Y%m%d) \
  --export-format DYNAMODB_JSON
```

## References

- [Device Token Access Patterns](./device-token-access-patterns.md)
- [standards/infrastructure-tier.md](../../standards/infrastructure-tier.md)
- [standards/global.md](../../standards/global.md)
- [DeviceTokenService Implementation](../../backend/src/services/deviceToken.service.ts)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [API Gateway Throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)
