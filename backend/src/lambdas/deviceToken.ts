import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DeviceTokenService } from '../services/deviceToken.service';
import { DeviceTokenRegistrationSchema } from '@photoeditor/shared';

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

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('device-token-handler');
  tracer.setSegment(subsegment);

  try {
    await initializeServices();

    const httpMethod = event.requestContext.http.method;
    const userId = event.requestContext.authorizer?.claims?.sub || 'anonymous';

    if (httpMethod === 'POST') {
      return await handleRegisterDeviceToken(event, userId);
    } else if (httpMethod === 'DELETE') {
      return await handleDeactivateDeviceToken(event, userId);
    } else {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

  } catch (error) {
    logger.error('Error in device token handler', { error: error as Error });
    metrics.addMetric('DeviceTokenError', MetricUnits.Count, 1);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    subsegment?.close();
    tracer.setSegment(segment);
  }
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

    metrics.addMetric('DeviceTokenRegistered', MetricUnits.Count, 1);

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

    metrics.addMetric('DeviceTokenDeactivated', MetricUnits.Count, 1);

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
