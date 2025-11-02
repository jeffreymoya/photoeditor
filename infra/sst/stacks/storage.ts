/**
 * Storage Stack - S3 Buckets, DynamoDB, KMS
 *
 * ADR-0008 Phase 1: Inline resource provisioning with standards compliance.
 * Phase 2 migration: Extract KMS, S3, DynamoDB into versioned Terraform modules.
 * See adr/0008-sst-parity.md for parity contract and migration plan.
 *
 * Standards compliance (inherited from future modules):
 * - S3 SSE-KMS encryption with customer-managed keys (cross-cutting.md#security--privacy)
 * - S3 block-public-access enabled (cross-cutting.md#hard-fail-controls: "Production buckets without KMS encryption or block-public-access controls hard fail")
 * - Cost tags: Project, Env, Owner, CostCenter (cross-cutting.md#hard-fail-controls: "Cloud resources must carry Project, Env, Owner, and CostCenter tags")
 * - Temp bucket: 48h lifecycle (infrastructure-tier.md#storage)
 * - Final bucket: versioning, incomplete multipart cleanup, Glacier after 90d (infrastructure-tier.md#storage: "transition compliance archives to Glacier after 90 days")
 * - DynamoDB PITR enabled (infrastructure-tier.md#database)
 * - DynamoDB capacity: on-demand for dev/stage, provisioned for prod (infrastructure-tier.md#database: "run on on-demand capacity for dev/stage and provisioned throughput for prod")
 * - DynamoDB TTL for device tokens (infrastructure-tier.md#database: "Apply item TTL where appropriate")
 *
 * Module migration status:
 * - KMS key → Future module (TASK-0823)
 * - S3 buckets → Future module (TASK-0823)
 * - DynamoDB tables → Future module (TASK-0823)
 */

/**
 * DynamoDB capacity configuration per stage
 * Per infrastructure-tier.md#database: "run on on-demand capacity for dev/stage and provisioned throughput for prod"
 * Targets documented in docs/storage/capacity-and-lifecycle.md
 */
type DynamoCapacityConfig = {
  readonly billingMode: "PAY_PER_REQUEST" | "PROVISIONED";
  readonly readCapacity?: number;
  readonly writeCapacity?: number;
};

const JOBS_TABLE_CAPACITY: Record<string, DynamoCapacityConfig> = {
  dev: { billingMode: "PAY_PER_REQUEST" },
  stage: { billingMode: "PAY_PER_REQUEST" },
  prod: { billingMode: "PROVISIONED", readCapacity: 10, writeCapacity: 5 },
};

const DEVICE_TOKENS_TABLE_CAPACITY: Record<string, DynamoCapacityConfig> = {
  dev: { billingMode: "PAY_PER_REQUEST" },
  stage: { billingMode: "PAY_PER_REQUEST" },
  prod: { billingMode: "PROVISIONED", readCapacity: 3, writeCapacity: 2 },
};

const BATCH_JOBS_TABLE_CAPACITY: Record<string, DynamoCapacityConfig> = {
  dev: { billingMode: "PAY_PER_REQUEST" },
  stage: { billingMode: "PAY_PER_REQUEST" },
  prod: { billingMode: "PROVISIONED", readCapacity: 5, writeCapacity: 3 },
};

/**
 * Get capacity configuration for the current stage, falling back to on-demand for unknown stages
 */
function getCapacityConfig(
  configMap: Record<string, DynamoCapacityConfig>,
  stage: string
): DynamoCapacityConfig {
  return configMap[stage] ?? { billingMode: "PAY_PER_REQUEST" };
}

export default function StorageStack() {
  const stage = $app.stage;
  // KMS key for encryption (customer-managed)
  const kmsKey = new aws.kms.Key("PhotoEditorDevKey", {
    description: "PhotoEditor dev environment encryption key",
    enableKeyRotation: true,
    deletionWindowInDays: 7,
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.kms.Alias("PhotoEditorDevKeyAlias", {
    name: `alias/photoeditor-${$app.stage}`,
    targetKeyId: kmsKey.keyId,
  });

  // Temp uploads bucket - 48h lifecycle, SSE-KMS
  const tempBucket = new sst.aws.Bucket("TempUploadsBucket", {
    transform: {
      bucket: {
        bucket: `photoeditor-${$app.stage}-temp-uploads-${aws.getCallerIdentityOutput({}).accountId}`,
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "TempUploads",
        },
      },
    },
  });

  // Apply lifecycle rule for temp bucket (48h expiry)
  new aws.s3.BucketLifecycleConfigurationV2("TempBucketLifecycle", {
    bucket: tempBucket.name,
    rules: [
      {
        id: "delete-temp-after-48h",
        status: "Enabled",
        expiration: {
          days: 2,
        },
      },
      {
        id: "abort-incomplete-multipart-7d",
        status: "Enabled",
        abortIncompleteMultipartUpload: {
          daysAfterInitiation: 7,
        },
      },
    ],
  });

  // Server-side encryption for temp bucket
  new aws.s3.BucketServerSideEncryptionConfigurationV2("TempBucketEncryption", {
    bucket: tempBucket.name,
    rules: [
      {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: "aws:kms",
          kmsMasterKeyId: kmsKey.arn,
        },
        bucketKeyEnabled: true,
      },
    ],
  });

  // Block public access for temp bucket (cross-cutting.md L10, L52)
  new aws.s3.BucketPublicAccessBlock("TempBucketPublicAccessBlock", {
    bucket: tempBucket.name,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  // Final assets bucket - versioned, SSE-KMS
  const finalBucket = new sst.aws.Bucket("FinalAssetsBucket", {
    transform: {
      bucket: {
        bucket: `photoeditor-${$app.stage}-final-assets-${aws.getCallerIdentityOutput({}).accountId}`,
        versioning: {
          enabled: true,
        },
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "FinalAssets",
        },
      },
    },
  });

  // Lifecycle rules for final bucket
  // Per infrastructure-tier.md#storage: "transition compliance archives to Glacier after 90 days"
  new aws.s3.BucketLifecycleConfigurationV2("FinalBucketLifecycle", {
    bucket: finalBucket.name,
    rules: [
      {
        id: "abort-incomplete-multipart-7d",
        status: "Enabled",
        abortIncompleteMultipartUpload: {
          daysAfterInitiation: 7,
        },
      },
      {
        id: "transition-to-glacier-90d",
        status: "Enabled",
        transitions: [
          {
            days: 90,
            storageClass: "GLACIER",
          },
        ],
      },
    ],
  });

  // Server-side encryption for final bucket
  new aws.s3.BucketServerSideEncryptionConfigurationV2("FinalBucketEncryption", {
    bucket: finalBucket.name,
    rules: [
      {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: "aws:kms",
          kmsMasterKeyId: kmsKey.arn,
        },
        bucketKeyEnabled: true,
      },
    ],
  });

  // Block public access for final bucket (cross-cutting.md L10, L52)
  new aws.s3.BucketPublicAccessBlock("FinalBucketPublicAccessBlock", {
    bucket: finalBucket.name,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  // DynamoDB table for jobs - PITR enabled, stage-aware capacity
  const jobsCapacity = getCapacityConfig(JOBS_TABLE_CAPACITY, stage);
  const jobsTable = new sst.aws.Dynamo("JobsTable", {
    fields: {
      jobId: "string",
      userId: "string",
      status: "string",
      createdAt: "string",
      batchJobId: "string",
    },
    primaryIndex: { hashKey: "jobId" },
    globalIndexes: {
      UserJobsIndex: {
        hashKey: "userId",
        rangeKey: "createdAt",
      },
      StatusIndex: {
        hashKey: "status",
        rangeKey: "createdAt",
      },
      BatchJobIdIndex: {
        hashKey: "batchJobId",
        rangeKey: "createdAt",
      },
    },
    stream: "new-and-old-images",
    transform: {
      table: {
        billingMode: jobsCapacity.billingMode,
        ...(jobsCapacity.billingMode === "PROVISIONED" && {
          readCapacity: jobsCapacity.readCapacity,
          writeCapacity: jobsCapacity.writeCapacity,
        }),
        pointInTimeRecovery: {
          enabled: true,
        },
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
        },
      },
    },
  });

  // DynamoDB table for device tokens - PITR enabled, stage-aware capacity, TTL for expiry
  const deviceTokensCapacity = getCapacityConfig(DEVICE_TOKENS_TABLE_CAPACITY, stage);
  const deviceTokensTable = new sst.aws.Dynamo("DeviceTokensTable", {
    fields: {
      userId: "string",
      deviceId: "string",
      expoPushToken: "string",
      platform: "string",
      registeredAt: "string",
      updatedAt: "string",
      isActive: "string", // DynamoDB doesn't support boolean in key schema
      expiresAt: "number", // TTL attribute (Unix epoch timestamp)
    },
    primaryIndex: { hashKey: "userId", rangeKey: "deviceId" },
    ttl: "expiresAt", // Automatic expiry after 90 days
    transform: {
      table: {
        billingMode: deviceTokensCapacity.billingMode,
        ...(deviceTokensCapacity.billingMode === "PROVISIONED" && {
          readCapacity: deviceTokensCapacity.readCapacity,
          writeCapacity: deviceTokensCapacity.writeCapacity,
        }),
        pointInTimeRecovery: {
          enabled: true,
        },
        serverSideEncryption: {
          enabled: true,
          kmsMasterKeyId: kmsKey.arn,
        },
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "DeviceTokens",
        },
      },
    },
  });

  // DynamoDB table for batch jobs - PITR enabled, stage-aware capacity
  const batchCapacity = getCapacityConfig(BATCH_JOBS_TABLE_CAPACITY, stage);
  const batchTable = new sst.aws.Dynamo("BatchJobsTable", {
    fields: {
      batchJobId: "string",
      userId: "string",
      status: "string",
      createdAt: "string",
    },
    primaryIndex: { hashKey: "batchJobId" },
    globalIndexes: {
      UserBatchJobsIndex: {
        hashKey: "userId",
        rangeKey: "createdAt",
      },
    },
    stream: "new-and-old-images",
    transform: {
      table: {
        billingMode: batchCapacity.billingMode,
        ...(batchCapacity.billingMode === "PROVISIONED" && {
          readCapacity: batchCapacity.readCapacity,
          writeCapacity: batchCapacity.writeCapacity,
        }),
        pointInTimeRecovery: {
          enabled: true,
        },
        serverSideEncryption: {
          enabled: true,
          kmsMasterKeyId: kmsKey.arn,
        },
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "BatchJobs",
        },
      },
    },
  });

  return {
    tempBucket,
    finalBucket,
    jobsTable,
    batchTable,
    deviceTokensTable,
    kmsKey,
  };
}
