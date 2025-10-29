/**
 * API Stack - HTTP API Gateway, BFF Lambda, Worker Lambda
 *
 * ADR-0008 Phase 1: Inline Lambda and API Gateway provisioning (remains SST-native).
 * Phase 2 migration: CloudWatch log groups and alarms extracted to Terraform modules.
 * See adr/0008-sst-parity.md for parity contract and migration plan.
 *
 * Standards compliance:
 * - API Lambdas outside VPC (infrastructure-tier.md L16)
 * - Handlers ≤75 LOC, complexity ≤10 (cross-cutting.md L6)
 * - No handler imports @aws-sdk/* (cross-cutting.md L4, backend-tier.md)
 * - Lambda errors >0 for 5m alarm (cross-cutting.md L47)
 * - API 5XX >1% for 5m alarm (cross-cutting.md L47)
 * - Structured JSON logs with correlationId, traceId, etc. (cross-cutting.md L40)
 * - Log retention: Dev 14d, Prod 90d (cross-cutting.md L46)
 * - Cost tags: Project, Env, Owner, CostCenter (cross-cutting.md L11)
 *
 * Module migration status:
 * - Lambda functions → Remain SST-native (ADR-0008)
 * - API Gateway → Remain SST-native (ADR-0008)
 * - CloudWatch log groups → Future module (TASK-0823)
 * - CloudWatch alarms → Future module (TASK-0823)
 */

interface ApiStackProps {
  tempBucket: sst.aws.Bucket;
  finalBucket: sst.aws.Bucket;
  jobsTable: sst.aws.Dynamo;
  batchTable: sst.aws.Dynamo;
  deviceTokensTable: sst.aws.Dynamo;
  processingQueue: sst.aws.Queue;
  notificationTopic: sst.aws.SnsTopic;
  kmsKey: aws.kms.Key;
}

export default function ApiStack(props: ApiStackProps) {
  const { tempBucket, finalBucket, jobsTable, batchTable, deviceTokensTable, processingQueue, notificationTopic, kmsKey } = props;

  // Lambda environment variables (shared)
  const lambdaEnv = {
    NODE_ENV: $app.stage === "production" ? "production" : "development",
    STAGE: $app.stage,
    PROJECT_NAME: "PhotoEditor",
    TEMP_BUCKET_NAME: tempBucket.name,
    FINAL_BUCKET_NAME: finalBucket.name,
    JOBS_TABLE_NAME: jobsTable.name,
    BATCH_TABLE_NAME: batchTable.name,
    PROCESSING_QUEUE_URL: processingQueue.url,
    NOTIFICATION_TOPIC_ARN: notificationTopic.arn,
    SNS_TOPIC_ARN: notificationTopic.arn,
    LOG_LEVEL: "info",
    POWERTOOLS_SERVICE_NAME: "photoeditor-api",
    POWERTOOLS_METRICS_NAMESPACE: "PhotoEditor",
  };

  // BFF Lambda - handles presign, status, download
  const bffFunction = new sst.aws.Function("BffFunction", {
    handler: "backend/src/lambdas/presign.handler",
    runtime: "nodejs20.x",
    timeout: "30 seconds",
    memory: "256 MB",
    environment: lambdaEnv,
    permissions: [
      {
        actions: ["s3:PutObject", "s3:GetObject"],
        resources: [tempBucket.arn, `${tempBucket.arn}/*`, finalBucket.arn, `${finalBucket.arn}/*`],
      },
      {
        actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"],
        resources: [jobsTable.arn, `${jobsTable.arn}/index/*`, batchTable.arn, `${batchTable.arn}/index/*`],
      },
      {
        actions: ["sqs:SendMessage"],
        resources: [processingQueue.arn],
      },
      {
        actions: ["kms:Decrypt", "kms:GenerateDataKey"],
        resources: [kmsKey.arn],
      },
    ],
    transform: {
      function: {
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Function: "BFF",
        },
      },
    },
  });

  // Status Lambda - lightweight status check
  const statusFunction = new sst.aws.Function("StatusFunction", {
    handler: "backend/src/lambdas/status.handler",
    runtime: "nodejs20.x",
    timeout: "10 seconds",
    memory: "128 MB",
    environment: lambdaEnv,
    permissions: [
      {
        actions: ["dynamodb:GetItem", "dynamodb:Query"],
        resources: [jobsTable.arn, `${jobsTable.arn}/index/*`, batchTable.arn, `${batchTable.arn}/index/*`],
      },
      {
        actions: ["kms:Decrypt"],
        resources: [kmsKey.arn],
      },
    ],
    transform: {
      function: {
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Function: "Status",
        },
      },
    },
  });

  // Download Lambda - presigned download URLs
  const downloadFunction = new sst.aws.Function("DownloadFunction", {
    handler: "backend/src/lambdas/download.handler",
    runtime: "nodejs20.x",
    timeout: "10 seconds",
    memory: "128 MB",
    environment: lambdaEnv,
    permissions: [
      {
        actions: ["s3:GetObject"],
        resources: [finalBucket.arn, `${finalBucket.arn}/*`],
      },
      {
        actions: ["dynamodb:GetItem"],
        resources: [jobsTable.arn],
      },
      {
        actions: ["kms:Decrypt"],
        resources: [kmsKey.arn],
      },
    ],
    transform: {
      function: {
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Function: "Download",
        },
      },
    },
  });

  // Device Token Lambda - Expo push notification token registration/deactivation
  const deviceTokenFunction = new sst.aws.Function("DeviceTokenFunction", {
    handler: "backend/src/lambdas/deviceToken.handler",
    runtime: "nodejs20.x",
    timeout: "10 seconds",
    memory: "128 MB",
    environment: {
      ...lambdaEnv,
      DEVICE_TOKEN_TABLE_NAME: deviceTokensTable.name,
    },
    permissions: [
      {
        actions: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"],
        resources: [deviceTokensTable.arn],
      },
      {
        actions: ["kms:Decrypt", "kms:GenerateDataKey"],
        resources: [kmsKey.arn],
      },
    ],
    transform: {
      function: {
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Function: "DeviceToken",
        },
      },
    },
  });

  // Worker Lambda - processes jobs from SQS
  const workerFunction = new sst.aws.Function("WorkerFunction", {
    handler: "backend/src/lambdas/worker.handler",
    runtime: "nodejs20.x",
    timeout: "5 minutes",
    memory: "512 MB",
    environment: lambdaEnv,
    permissions: [
      {
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [tempBucket.arn, `${tempBucket.arn}/*`, finalBucket.arn, `${finalBucket.arn}/*`],
      },
      {
        actions: ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"],
        resources: [jobsTable.arn, `${jobsTable.arn}/index/*`, batchTable.arn, `${batchTable.arn}/index/*`],
      },
      {
        actions: ["sns:Publish"],
        resources: [notificationTopic.arn],
      },
      {
        actions: ["kms:Decrypt", "kms:GenerateDataKey"],
        resources: [kmsKey.arn],
      },
    ],
    transform: {
      function: {
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Function: "Worker",
        },
      },
    },
  });

  // SQS event source mapping for worker
  new aws.lambda.EventSourceMapping("WorkerEventSource", {
    eventSourceArn: processingQueue.arn,
    functionName: workerFunction.name,
    batchSize: 10,
    maximumBatchingWindowInSeconds: 5,
  });

  // HTTP API Gateway
  const httpApi = new sst.aws.ApiGatewayV2("PhotoEditorApi", {
    cors: {
      allowOrigins: ["http://localhost:19000", "http://localhost:19006"],
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Content-Type", "Authorization", "x-correlation-id", "traceparent"],
    },
    transform: {
      api: {
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
        },
      },
    },
  });

  // API Routes
  httpApi.route("POST /presign", bffFunction.arn);
  httpApi.route("GET /status/{jobId}", statusFunction.arn);
  httpApi.route("GET /batch-status/{batchJobId}", statusFunction.arn);
  httpApi.route("GET /download/{jobId}", downloadFunction.arn);

  // Device Token Routes (standards/infrastructure-tier.md line 79: throttling configured at API Gateway level)
  httpApi.route("POST /v1/device-tokens", deviceTokenFunction.arn);
  httpApi.route("DELETE /v1/device-tokens", deviceTokenFunction.arn);

  // Lambda permission for API Gateway to invoke functions
  new aws.lambda.Permission("BffInvokePermission", {
    action: "lambda:InvokeFunction",
    function: bffFunction.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: $interpolate`${httpApi.executionArn}/*/*`,
  });

  new aws.lambda.Permission("StatusInvokePermission", {
    action: "lambda:InvokeFunction",
    function: statusFunction.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: $interpolate`${httpApi.executionArn}/*/*`,
  });

  new aws.lambda.Permission("DownloadInvokePermission", {
    action: "lambda:InvokeFunction",
    function: downloadFunction.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: $interpolate`${httpApi.executionArn}/*/*`,
  });

  new aws.lambda.Permission("DeviceTokenInvokePermission", {
    action: "lambda:InvokeFunction",
    function: deviceTokenFunction.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: $interpolate`${httpApi.executionArn}/*/*`,
  });

  // CloudWatch Log Groups with retention (Dev 14d, Prod 90d per cross-cutting.md L46)
  new aws.cloudwatch.LogGroup("BffLogGroup", {
    name: `/aws/lambda/${bffFunction.name}`,
    retentionInDays: $app.stage === "production" ? 90 : 14,
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.cloudwatch.LogGroup("StatusLogGroup", {
    name: `/aws/lambda/${statusFunction.name}`,
    retentionInDays: $app.stage === "production" ? 90 : 14,
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.cloudwatch.LogGroup("DownloadLogGroup", {
    name: `/aws/lambda/${downloadFunction.name}`,
    retentionInDays: $app.stage === "production" ? 90 : 14,
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.cloudwatch.LogGroup("WorkerLogGroup", {
    name: `/aws/lambda/${workerFunction.name}`,
    retentionInDays: $app.stage === "production" ? 90 : 14,
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.cloudwatch.LogGroup("DeviceTokenLogGroup", {
    name: `/aws/lambda/${deviceTokenFunction.name}`,
    retentionInDays: $app.stage === "production" ? 90 : 14,
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  // CloudWatch alarms: Lambda Errors >0 for 5m (cross-cutting.md L47)
  new aws.cloudwatch.MetricAlarm("BffErrorAlarm", {
    name: `photoeditor-${$app.stage}-bff-errors`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "Errors",
    namespace: "AWS/Lambda",
    period: 300, // 5 minutes
    statistic: "Sum",
    threshold: 0,
    treatMissingData: "notBreaching",
    alarmDescription: "Alert when BFF Lambda has errors (cross-cutting.md L47)",
    dimensions: {
      FunctionName: bffFunction.name,
    },
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.cloudwatch.MetricAlarm("WorkerErrorAlarm", {
    name: `photoeditor-${$app.stage}-worker-errors`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "Errors",
    namespace: "AWS/Lambda",
    period: 300, // 5 minutes
    statistic: "Sum",
    threshold: 0,
    treatMissingData: "notBreaching",
    alarmDescription: "Alert when Worker Lambda has errors (cross-cutting.md L47)",
    dimensions: {
      FunctionName: workerFunction.name,
    },
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  new aws.cloudwatch.MetricAlarm("DeviceTokenErrorAlarm", {
    name: `photoeditor-${$app.stage}-device-token-errors`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "Errors",
    namespace: "AWS/Lambda",
    period: 300, // 5 minutes
    statistic: "Sum",
    threshold: 0,
    treatMissingData: "notBreaching",
    alarmDescription: "Alert when Device Token Lambda has errors (cross-cutting.md L47)",
    dimensions: {
      FunctionName: deviceTokenFunction.name,
    },
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  // CloudWatch alarm: API 5XX >1% for 5m (cross-cutting.md L47)
  new aws.cloudwatch.MetricAlarm("Api5XXAlarm", {
    name: `photoeditor-${$app.stage}-api-5xx-rate`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "5XXError",
    namespace: "AWS/ApiGateway",
    period: 300, // 5 minutes
    statistic: "Average",
    threshold: 0.01, // 1%
    treatMissingData: "notBreaching",
    alarmDescription: "Alert when API Gateway 5XX error rate >1% for 5 minutes (cross-cutting.md L47)",
    dimensions: {
      ApiId: httpApi.id,
    },
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  return {
    httpApi,
    bffFunction,
    statusFunction,
    downloadFunction,
    deviceTokenFunction,
    workerFunction,
  };
}
