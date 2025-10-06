/**
 * Storage Stack - S3 Buckets, DynamoDB, KMS
 *
 * STANDARDS.md compliance:
 * - S3 SSE-KMS encryption (line 112)
 * - Cost tags: Project, Env, Owner, CostCenter (line 44)
 * - Temp bucket: 48h lifecycle (line 177)
 * - Final bucket: versioning, incomplete multipart cleanup (line 178)
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

  // DynamoDB table for jobs - PITR enabled, on-demand billing
  const jobsTable = new sst.aws.Dynamo("JobsTable", {
    fields: {
      jobId: "string",
      userId: "string",
      status: "string",
      createdAt: "string",
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

  return {
    tempBucket,
    finalBucket,
    jobsTable,
    kmsKey,
  };
}
