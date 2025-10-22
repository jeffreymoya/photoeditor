/**
 * Middy Middleware for Service Injection
 *
 * Middleware that injects the service container into the Lambda context.
 * Ensures services are initialized once (cold start) and reused across invocations.
 *
 * This middleware ensures:
 * - Single initialization of services during cold start
 * - Service reuse across warm invocations
 * - No in-handler service instantiation (standards/backend-tier.md, line 68)
 *
 * @module core/container/middleware
 */
// @ts-nocheck


import type { MiddlewareObj } from '@middy/core';
import type { Context } from 'aws-lambda';
import { ServiceContainer, ServiceContainerConfig, createServiceContainer } from './service-container';

/**
 * Extended context with service container
 */
export interface ServiceContext extends Context {
  container: ServiceContainer;
}

/**
 * Module-level cache for service container (singleton per Lambda instance)
 * This is initialized once during cold start and reused for warm invocations
 */
let containerCache: ServiceContainer | null = null;

/**
 * Creates Middy middleware for service injection
 *
 * @param config - Configuration for service container initialization
 * @returns Middy middleware object
 */
export function serviceInjection(
  config: ServiceContainerConfig = {}
): MiddlewareObj<unknown, unknown, Error, ServiceContext> {
  return {
    before: async (request) => {
      // Initialize container on cold start, reuse on warm starts
      if (!containerCache) {
        containerCache = await createServiceContainer(config);
      }

      // Inject container into context
      request.context.container = containerCache;
    }
  };
}

/**
 * Test utility to reset container cache
 * Should only be used in test environments
 */
export function __resetContainerCache(): void {
  containerCache = null;
}
