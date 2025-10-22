/*
 * LocalStack readiness probe for E2E tests.
 * Replaces brittle fixed sleeps with an exponential backoff check
 * against DynamoDB ListTables on the configured LocalStack endpoint.
 */
// @ts-nocheck


const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

async function waitForLocalStack({
  endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
  region = process.env.AWS_REGION || 'us-east-1',
  maxRetries = 10,
  initialDelayMs = 250,
  timeoutMs = 30000
} = {}) {
  const client = new DynamoDBClient({
    region,
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
  });

  let retries = 0;
  let delay = initialDelayMs;
  const deadline = Date.now() + timeoutMs;

  while (retries <= maxRetries && Date.now() < deadline) {
    try {
      await client.send(new ListTablesCommand({}));
      client.destroy();
      return true;
    } catch (err) {
      retries += 1;
      if (retries > maxRetries || Date.now() + delay > deadline) {
        client.destroy();
        const hint = "Ensure LocalStack is up: 'docker compose -f ../docker-compose.localstack.yml up -d'";
        throw new Error(`LocalStack not ready at ${endpoint} after ${retries} attempts. ${hint}. Last error: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 2000);
    }
  }
}

// Execute when run as a script
waitForLocalStack()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('LocalStack is ready.');
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err.message);
    process.exit(1);
  });

