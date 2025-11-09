import { Tracer } from '@aws-lambda-powertools/tracer';
import { APIGatewayProxyEventV2 , SQSRecord } from 'aws-lambda';

/**
 * Correlation context extracted from events for distributed tracing
 */
export interface CorrelationContext {
  traceparent?: string | undefined;
  correlationId?: string | undefined;
  traceId?: string | undefined;
  requestId: string;
}

/**
 * Executes a function within a new X-Ray subsegment
 * Automatically manages subsegment lifecycle (create, set, close, restore)
 *
 * @param name - Name of the subsegment
 * @param tracer - AWS X-Ray tracer instance
 * @param fn - Function to execute within the subsegment
 * @returns The result of the function execution
 *
 * @example
 * ```typescript
 * const result = await withSubsegment('my-operation', tracer, async () => {
 *   // Your code here
 *   return someValue;
 * });
 * ```
 */
export async function withSubsegment<T>(
  name: string,
  tracer: Tracer,
  fn: () => Promise<T>
): Promise<T> {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment(name);

  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  try {
    return await fn();
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
}

/**
 * Extracts correlation context from an API Gateway event
 * Used for distributed tracing across services
 *
 * @param event - API Gateway Proxy Event V2
 * @returns Correlation context with traceparent, requestId, and traceId
 */
export function extractCorrelationContextFromApiEvent(
  event: APIGatewayProxyEventV2
): CorrelationContext {
  const traceparent = event.headers['traceparent'];
  const requestId = event.requestContext.requestId;
  const traceId = traceparent?.split('-')[1];

  return {
    traceparent,
    requestId,
    traceId
  };
}

/**
 * Extracts correlation context from an SQS record
 * Used for distributed tracing in async message processing
 *
 * @param record - SQS record from event
 * @param fallbackCorrelationId - Fallback value if correlationId is not in message attributes
 * @returns Correlation context with traceparent, correlationId, requestId, and traceId
 */
export function extractCorrelationContextFromSqsRecord(
  record: SQSRecord,
  fallbackCorrelationId: string
): CorrelationContext {
  const traceparent = record.messageAttributes?.traceparent?.stringValue;
  const correlationId = record.messageAttributes?.correlationId?.stringValue || fallbackCorrelationId;
  const traceId = traceparent?.split('-')[1];

  return {
    traceparent,
    correlationId,
    traceId,
    requestId: record.messageId
  };
}
