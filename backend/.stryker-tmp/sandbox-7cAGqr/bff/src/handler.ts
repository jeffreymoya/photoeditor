import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import awsLambdaFastify from '@fastify/aws-lambda';
import { bootstrap } from './main';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'bff-handler' });

let cachedHandler: ReturnType<typeof awsLambdaFastify> | null = null;

/**
 * Lambda handler for NestJS BFF using aws-lambda-fastify adapter
 * Implements cold start optimization through handler caching
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    // Initialize handler on cold start
    if (!cachedHandler) {
      logger.info('Cold start: bootstrapping NestJS application');
      const app = await bootstrap();
      await app.init();

      const fastifyInstance = app.getHttpAdapter().getInstance();
      cachedHandler = awsLambdaFastify(fastifyInstance);

      logger.info('BFF handler initialized successfully');
    }

    // Forward request to Fastify
    return await cachedHandler(event, context);
  } catch (error) {
    logger.error('BFF handler error', { error: error as Error });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
