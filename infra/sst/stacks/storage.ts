/**
 * Storage Stack - S3 Buckets, DynamoDB, KMS
 *
 * STANDARDS.md compliance:
 * - S3 SSE-KMS encryption with customer-managed keys (cross-cutting.md L52)
 * - S3 block-public-access enabled (cross-cutting.md L10, L52)
 * - Cost tags: Project, Env, Owner, CostCenter (cross-cutting.md L11)
 * - Temp bucket: 48h lifecycle
 * - Final bucket: versioning, incomplete multipart cleanup
 */

export default function StorageStack() {
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

  // DynamoDB table for jobs - PITR enabled, on-demand billing
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
        billingMode: "PAY_PER_REQUEST",
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

  // DynamoDB table for device tokens - PITR enabled, on-demand billing, TTL for expiry
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
        billingMode: "PAY_PER_REQUEST",
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

  // DynamoDB table for batch jobs - PITR enabled, on-demand billing
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
        billingMode: "PAY_PER_REQUEST",
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
