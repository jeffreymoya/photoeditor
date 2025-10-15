# Device Token DynamoDB Access Patterns

## Overview

This document describes the access patterns, schema design, and operational considerations for the device token DynamoDB table used by the PhotoEditor mobile push notification system.

## Table Schema

### Primary Key Design

- **Partition Key (HASH):** `userId` (String)
- **Sort Key (RANGE):** `deviceId` (String)

This composite key enables:
1. Direct lookup of a specific device token for a user
2. Efficient querying of all devices for a single user
3. Natural deduplication (one token per user-device pair)

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | String | Yes | User identifier (from auth claims) |
| deviceId | String | Yes | Unique device identifier (from Expo) |
| expoPushToken | String | Yes | Expo push notification token |
| platform | String | Yes | Device platform: 'ios' or 'android' |
| registeredAt | String | Yes | ISO 8601 timestamp of initial registration |
| updatedAt | String | Yes | ISO 8601 timestamp of last update |
| isActive | Boolean | Yes | Whether token is active (soft delete) |
| expiresAt | Number | No | Unix epoch timestamp for TTL (90 days from registration) |

### TTL Configuration

- **TTL Attribute:** `expiresAt`
- **Retention Period:** 90 days from registration
- **Purpose:** Automatically remove stale device tokens to reduce storage costs and prevent sending notifications to uninstalled apps

The `expiresAt` attribute is set to `registeredAt + 90 days` and is automatically managed by DynamoDB TTL. Applications should refresh tokens on app launch to extend this TTL.

## Access Patterns

### Pattern 1: Register/Update Device Token (Write)
**Operation:** `PutItem` with conditional expression
**Key:** `{userId, deviceId}`
**Use Case:** User opens app and registers for push notifications
**Frequency:** High (on every app launch)
**Consistency:** Eventual

```typescript
// If device doesn't exist, create it
// If device exists, fallback to UpdateItem
PutItem({
  TableName: deviceTokenTableName,
  Item: { userId, deviceId, expoPushToken, platform, registeredAt, updatedAt, isActive, expiresAt },
  ConditionExpression: 'attribute_not_exists(userId) OR attribute_not_exists(deviceId)'
})
```

### Pattern 2: Update Existing Device Token (Write)
**Operation:** `UpdateItem`
**Key:** `{userId, deviceId}`
**Use Case:** Refresh token for existing device (app reinstall or token rotation)
**Frequency:** Medium
**Consistency:** Eventual

```typescript
UpdateItem({
  TableName: deviceTokenTableName,
  Key: { userId, deviceId },
  UpdateExpression: 'SET expoPushToken = :token, updatedAt = :now, isActive = :active, expiresAt = :expires',
  ConditionExpression: 'attribute_exists(userId)'
})
```

### Pattern 3: Get Single Device Token (Read)
**Operation:** `GetItem`
**Key:** `{userId, deviceId}`
**Use Case:** Verify device registration status
**Frequency:** Low
**Consistency:** Strongly consistent

```typescript
GetItem({
  TableName: deviceTokenTableName,
  Key: { userId, deviceId },
  ConsistentRead: true
})
```

### Pattern 4: Get All Devices for User (Read)
**Operation:** `Query`
**Key Condition:** `userId = :userId`
**Use Case:** Send notification to all user's devices
**Frequency:** High (on job completion)
**Consistency:** Eventual

```typescript
Query({
  TableName: deviceTokenTableName,
  KeyConditionExpression: 'userId = :userId',
  FilterExpression: 'isActive = :true',
  ExpressionAttributeValues: {
    ':userId': userId,
    ':true': true
  }
})
```

### Pattern 5: Deactivate Device Token (Write)
**Operation:** `UpdateItem`
**Key:** `{userId, deviceId}`
**Use Case:** User logs out or uninstalls app
**Frequency:** Low
**Consistency:** Eventual

```typescript
UpdateItem({
  TableName: deviceTokenTableName,
  Key: { userId, deviceId },
  UpdateExpression: 'SET isActive = :false, updatedAt = :now',
  ConditionExpression: 'attribute_exists(userId)'
})
```

### Pattern 6: Delete Device Token (Write)
**Operation:** `DeleteItem`
**Key:** `{userId, deviceId}`
**Use Case:** Hard delete on explicit user request (privacy/GDPR)
**Frequency:** Very low
**Consistency:** Eventual

```typescript
DeleteItem({
  TableName: deviceTokenTableName,
  Key: { userId, deviceId },
  ConditionExpression: 'attribute_exists(userId)'
})
```

## Global Secondary Index (GSI) Strategy

### Current Design: No GSI Required

The primary key design (`userId`, `deviceId`) efficiently supports all current access patterns:
- Pattern 1-3: Direct key access (no GSI needed)
- Pattern 4: Query on partition key only (no GSI needed)
- Pattern 5-6: Direct key access (no GSI needed)

### Future GSI Considerations

If we need to support additional access patterns, consider:

#### GSI 1: Platform-IsActive Index
**Use Case:** Find all active iOS/Android devices (for platform-specific broadcast)
**Partition Key:** `platform`
**Sort Key:** `isActive`
**Projection:** Keys + `expoPushToken`, `userId`

**Query Pattern:**
```typescript
Query({
  TableName: deviceTokenTableName,
  IndexName: 'PlatformIsActiveIndex',
  KeyConditionExpression: 'platform = :platform AND isActive = :true'
})
```

**Cost:** This GSI is NOT implemented because we don't currently support platform-specific broadcasts. Add only when needed to avoid unnecessary WCU/RCU costs.

## Capacity Planning

### Billing Mode
- **Dev/Stage:** On-demand (PAY_PER_REQUEST)
- **Production:** Consider provisioned capacity if steady-state load predictable

### Estimated Load (Production)
- **Users:** 10,000 active users
- **Devices per User:** Avg 2 (phone + tablet)
- **Total Items:** ~20,000 device tokens
- **Item Size:** ~400 bytes/item
- **Total Storage:** ~8 MB

### Read/Write Patterns
- **Writes:** 10K/day (app launches) = ~0.12 WPS avg, ~5 WPS peak
- **Reads:** 100K/day (job completions) = ~1.2 RPS avg, ~10 RPS peak

### Cost Estimate (On-Demand)
- **Write:** 10K writes/day × $1.25/million = $0.0125/day
- **Read:** 100K reads/day × $0.25/million = $0.025/day
- **Storage:** 8 MB × $0.25/GB-month = negligible
- **Total:** ~$1.13/month

## Point-In-Time Recovery (PITR)

**Status:** Enabled
**Retention:** 35 days
**Use Case:** Recover from accidental bulk deletes or table corruption
**Cost:** ~$0.02/month (20K items × 400 bytes × $0.20/GB-month)

PITR is mandatory per standards/infrastructure-tier.md line 36.

## Encryption

**Method:** Server-side encryption with KMS CMK
**Key:** Shared KMS key from kms module (auto-rotated annually)
**Scope:** Encrypts table data at rest, including indexes and backups

Encryption with KMS CMK is mandatory per standards/infrastructure-tier.md line 27.

## CloudWatch Alarms

### Alarm 1: User Errors Throttling
**Metric:** `UserErrors`
**Threshold:** > 10 in 5 minutes
**Action:** Investigate capacity or IAM policy issues

### Alarm 2: System Errors
**Metric:** `SystemErrors`
**Threshold:** > 0 in 5 minutes
**Action:** Page on-call (DynamoDB service issue)

### Alarm 3: Conditional Check Failures (High Rate)
**Metric:** `ConditionalCheckFailedRequests`
**Threshold:** > 100 in 5 minutes
**Action:** Investigate duplicate registration attempts

## Operational Runbooks

### Issue: Token Registration Failing
1. Check CloudWatch Logs for Lambda errors
2. Verify IAM policy grants `dynamodb:PutItem` and `dynamodb:UpdateItem`
3. Verify table exists and is in `ACTIVE` state
4. Check for throttling (UserErrors metric)

### Issue: Notifications Not Received
1. Query device token table for userId
2. Verify `isActive = true` and `expiresAt` is in future
3. Verify `expoPushToken` format is valid (ExponentPushToken[...])
4. Check SNS notification delivery logs

### Issue: Stale Tokens Accumulating
1. Verify TTL is enabled on table
2. Check `expiresAt` attribute is set on all items
3. Allow 24-48 hours for DynamoDB TTL to process expired items
4. If urgent, run manual cleanup Lambda

### Maintenance: Bulk Token Cleanup
```bash
# Query expired tokens (isActive = false AND updatedAt < 30 days ago)
aws dynamodb scan \
  --table-name photoeditor-dev-device-tokens \
  --filter-expression "isActive = :false AND updatedAt < :cutoff" \
  --projection-expression "userId, deviceId"

# Delete via Lambda or AWS CLI batch-write-item
```

## Testing Strategy

### Unit Tests
- DeviceTokenService CRUD operations
- Conditional expression handling
- TTL attribute calculation

### Integration Tests
- LocalStack DynamoDB table provisioning
- End-to-end registration flow
- Query all devices for user

### Load Tests
- Concurrent registrations (10 RPS)
- Query performance under load (100 devices/user)

## Compliance & Security

### Data Retention
- Device tokens retained for 90 days (TTL)
- PITR backups retained for 35 days
- Soft deletes via `isActive = false` flag

### GDPR/Privacy
- User can request hard delete via DELETE endpoint
- Table encrypted at rest with KMS CMK
- Access logs via CloudTrail (if enabled)

### IAM Policy (Least Privilege)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/photoeditor-ENV-device-tokens"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:REGION:ACCOUNT:key/KMS_KEY_ID"
    }
  ]
}
```

## References

- standards/infrastructure-tier.md (lines 27, 36-38: KMS, PITR, TTL)
- standards/global.md (line 18: Tagging)
- backend/src/services/deviceToken.service.ts (implementation)
- backend/src/lambdas/deviceToken.ts (handler)
