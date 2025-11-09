import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DeviceTokenRegistrationSchema } from '@photoeditor/shared';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

import { DeviceTokenService } from '../services/deviceToken.service';
import { withSubsegment } from '../utils/tracing';

const logger = new Logger();
const metrics = new Metrics();
const tracer = new Tracer();

let deviceTokenService: DeviceTokenService;

async function initializeServices(): Promise<void> {
  if (deviceTokenService) return;

  const region = process.env.AWS_REGION!;
  const deviceTokenTableName = process.env.DEVICE_TOKEN_TABLE_NAME!;

  deviceTokenService = new DeviceTokenService(deviceTokenTableName, region);
}

async function routeRequest(
  event: APIGatewayProxyEventV2,
  userId: string
): Promise<APIGatewayProxyResultV2> {
  const httpMethod = event.requestContext.http.method;

  if (httpMethod === 'POST') {
    return await handleRegisterDeviceToken(event, userId);
  }

  if (httpMethod === 'DELETE') {
    return await handleDeactivateDeviceToken(event, userId);
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Method not allowed' })
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> => {
  return withSubsegment('device-token-handler', tracer, async () => {
    try {
      await initializeServices();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (event.requestContext as any).authorizer?.claims?.sub || 'anonymous';

      return await routeRequest(event, userId);

    } catch (error) {
      logger.error('Error in device token handler', { error: error as Error });
      metrics.addMetric('DeviceTokenError', MetricUnit.Count, 1);

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  });
};

async function handleRegisterDeviceToken(
  event: APIGatewayProxyEventV2,
  userId: string
): Promise<APIGatewayProxyResultV2> {
  if (!event.body) {
    logger.warn('Missing request body for device token registration');
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request body required' })
    };
  }

  try {
    const body = JSON.parse(event.body);

    // Validate request body
    const validatedRequest = DeviceTokenRegistrationSchema.parse(body);

    logger.info('Registering device token', {
      userId,
      deviceId: validatedRequest.deviceId,
      platform: validatedRequest.platform
    });

    const registrationResult = await deviceTokenService.registerDeviceToken(userId, validatedRequest);

    metrics.addMetric('DeviceTokenRegistered', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        deviceToken: registrationResult
      })
    };

  } catch (error) {
    logger.error('Error registering device token', { error: error as Error, userId });

    if (error instanceof Error && error.name === 'ZodError') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid request format' })
      };
    }

    throw error;
  }
}

async function handleDeactivateDeviceToken(
  event: APIGatewayProxyEventV2,
  userId: string
): Promise<APIGatewayProxyResultV2> {
  const deviceId = event.queryStringParameters?.deviceId;

  if (!deviceId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'deviceId query parameter required' })
    };
  }

  try {
    logger.info('Deactivating device token', { userId, deviceId });

    await deviceTokenService.deactivateDeviceToken(userId, deviceId);

    metrics.addMetric('DeviceTokenDeactivated', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Device token deactivated successfully'
      })
    };

  } catch (error) {
    logger.error('Error deactivating device token', { error: error as Error, userId, deviceId });
    throw error;
  }
}
