/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST Dev Stack Configuration for PhotoEditor
 *
 * This stack provides rapid live AWS development loop with <2s inner loop for BFF Lambda.
 * See adr/0008-sst-parity.md for SST/Terraform coexistence strategy.
 * Standards: infrastructure-tier.md L16 (SST for local dev), cross-cutting.md L4-6 (layering, complexity).
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
    const { tempBucket, finalBucket, jobsTable, batchTable, deviceTokensTable, kmsKey } = storage.default();
    const { processingQueue, processingDLQ, notificationTopic } = messaging.default({
      kmsKey,
    });
    const { httpApi, bffFunction } = api.default({
      tempBucket,
      finalBucket,
      jobsTable,
      batchTable,
      deviceTokensTable,
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
      batchTable: batchTable.name,
      processingQueue: processingQueue.url,
      processingDLQ: processingDLQ.url,
      notificationTopic: notificationTopic.arn,
      bffFunction: bffFunction.name,
      region: aws.getRegionOutput().name,
    };
  },
});
