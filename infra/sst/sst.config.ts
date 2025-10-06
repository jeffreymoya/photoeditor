/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST Dev Stack Configuration for PhotoEditor
 *
 * This stack provides rapid live AWS development loop with <2s inner loop for BFF Lambda.
 * Follows STANDARDS.md: handlers→services→adapters, no VPC for API Lambdas (line 127),
 * KMS encryption (line 112), DLQ config (line 121), cost tags (line 44).
 */

export default $config({
  app(input) {
    return {
      name: "photoeditor-dev",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // Import stacks
    const storage = await import("./stacks/storage");
    const messaging = await import("./stacks/messaging");
    const api = await import("./stacks/api");

    // Deploy stacks
    const { tempBucket, finalBucket, jobsTable, kmsKey } = storage.default();
    const { processingQueue, processingDLQ, notificationTopic } = messaging.default({
      kmsKey,
    });
    const { httpApi, bffFunction } = api.default({
      tempBucket,
      finalBucket,
      jobsTable,
      processingQueue,
      notificationTopic,
      kmsKey,
    });

    // Outputs for smoke tests and observability
    return {
      api: httpApi.url,
      tempBucket: tempBucket.name,
      finalBucket: finalBucket.name,
      jobsTable: jobsTable.name,
      processingQueue: processingQueue.url,
      processingDLQ: processingDLQ.url,
      notificationTopic: notificationTopic.arn,
      bffFunction: bffFunction.name,
      region: aws.getRegionOutput().name,
    };
  },
});
