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
 * - No direct SDK client construction (STANDARDS.md line 32)
 * - Single source of truth for configuration (STANDARDS.md line 90)
 * - Idempotent worker execution (STANDARDS.md line 102)
 * - No mutable singleton state (STANDARDS.md line 59)
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
