/**
 * Core Library Module
 *
 * Central exports for shared backend core functionality used by both
 * BFF (Nest.js) and standalone workers (Lambda).
 *
 * This library provides:
 * - AWS client factories with environment-aware configuration
 * - Configuration service for SSM Parameter Store
 * - Provider factory and bootstrap service
 * - Idempotency and DLQ utilities
 *
 * Ensures compliance with:
 * - No direct SDK client construction
 * - Single source of truth for configuration
 * - Idempotent worker execution
 * - No mutable singleton state
 *
 * @module core
 */

// AWS Client Factory
export * from './aws';

// Configuration
export * from './config';

// Providers
export * from './providers';

// Idempotency & DLQ
export * from './idempotency';

// Service Container & Middy Middleware
// Note: Exported separately to avoid circular dependency with services
export { serviceInjection, type ServiceContext, __resetContainerCache } from './container/middleware';
export { createServiceContainer, type ServiceContainer, type ServiceContainerConfig } from './container/service-container';
