/**
 * Upload Feature Public API Tests
 *
 * TASK-0819: Verify feature layering boundaries
 * Per standards/frontend-tier.md#feature-guardrails:
 * - "Each feature publishes a /public surface; deep imports into internal paths are banned"
 *
 * These tests verify:
 * 1. Public API exports all necessary interfaces for screens
 * 2. Named exports only (no default exports in domain code)
 * 3. Type exports are available for consumers
 *
 * Per standards/typescript.md#analyzability:
 * - "Named exports in domain code"
 */

import * as PublicAPI from '../public';

describe('Upload Feature Public API', () => {
  describe('Service Context Exports (TASK-0819)', () => {
    /**
     * Verify ServiceProvider and useServices are exported
     * This allows screens to inject dependencies without deep imports
     */
    it('exports ServiceProvider component', () => {
      expect(PublicAPI.ServiceProvider).toBeDefined();
      expect(typeof PublicAPI.ServiceProvider).toBe('function');
    });

    it('exports useServices hook', () => {
      expect(PublicAPI.useServices).toBeDefined();
      expect(typeof PublicAPI.useServices).toBe('function');
    });
  });

  describe('Legacy Hook Exports', () => {
    it('exports useUpload hook', () => {
      expect(PublicAPI.useUpload).toBeDefined();
      expect(typeof PublicAPI.useUpload).toBe('function');
    });

    it('exports UploadStatus enum', () => {
      expect(PublicAPI.UploadStatus).toBeDefined();
    });
  });

  describe('XState Machine Exports', () => {
    it('exports useUploadMachine hook', () => {
      expect(PublicAPI.useUploadMachine).toBeDefined();
      expect(typeof PublicAPI.useUploadMachine).toBe('function');
    });

    it('exports machine state helper functions', () => {
      expect(PublicAPI.isUploadInProgress).toBeDefined();
      expect(typeof PublicAPI.isUploadInProgress).toBe('function');

      expect(PublicAPI.isUploadPauseable).toBeDefined();
      expect(typeof PublicAPI.isUploadPauseable).toBe('function');

      expect(PublicAPI.isUploadTerminal).toBeDefined();
      expect(typeof PublicAPI.isUploadTerminal).toBe('function');
    });
  });

  describe('RTK Query Exports', () => {
    it('exports uploadApi', () => {
      expect(PublicAPI.uploadApi).toBeDefined();
    });

    it('exports presign URL mutation hooks', () => {
      expect(PublicAPI.useRequestPresignUrlMutation).toBeDefined();
      expect(typeof PublicAPI.useRequestPresignUrlMutation).toBe('function');

      expect(PublicAPI.useRequestBatchPresignUrlsMutation).toBeDefined();
      expect(typeof PublicAPI.useRequestBatchPresignUrlsMutation).toBe('function');
    });

    it('exports job status query hooks', () => {
      expect(PublicAPI.useGetJobStatusQuery).toBeDefined();
      expect(typeof PublicAPI.useGetJobStatusQuery).toBe('function');

      expect(PublicAPI.useGetBatchJobStatusQuery).toBeDefined();
      expect(typeof PublicAPI.useGetBatchJobStatusQuery).toBe('function');

      expect(PublicAPI.useLazyGetJobStatusQuery).toBeDefined();
      expect(typeof PublicAPI.useLazyGetJobStatusQuery).toBe('function');

      expect(PublicAPI.useLazyGetBatchJobStatusQuery).toBeDefined();
      expect(typeof PublicAPI.useLazyGetBatchJobStatusQuery).toBe('function');
    });

    it('exports health check query hook', () => {
      expect(PublicAPI.useHealthCheckQuery).toBeDefined();
      expect(typeof PublicAPI.useHealthCheckQuery).toBe('function');
    });

    it('exports uploadToS3 helper', () => {
      expect(PublicAPI.uploadToS3).toBeDefined();
      expect(typeof PublicAPI.uploadToS3).toBe('function');
    });
  });

  describe('Named Exports Only (TypeScript Standards)', () => {
    /**
     * Per standards/typescript.md#modularity:
     * - "No default exports in domain code; prefer named exports"
     */
    it('does not export default', () => {
      expect((PublicAPI as { default?: unknown }).default).toBeUndefined();
    });

    it('exports all APIs as named exports', () => {
      // Verify that the module exports object contains the expected named exports
      const exportedNames = Object.keys(PublicAPI);

      // Should have service context exports
      expect(exportedNames).toContain('ServiceProvider');
      expect(exportedNames).toContain('useServices');

      // Should have hook exports
      expect(exportedNames).toContain('useUpload');
      expect(exportedNames).toContain('useUploadMachine');

      // Should have RTK Query exports
      expect(exportedNames).toContain('uploadApi');
      expect(exportedNames).toContain('useHealthCheckQuery');

      // Should have XState helper exports
      expect(exportedNames).toContain('isUploadInProgress');
      expect(exportedNames).toContain('isUploadPauseable');
      expect(exportedNames).toContain('isUploadTerminal');
    });
  });

  describe('Minimal Public Surface (TypeScript Standards)', () => {
    /**
     * Per standards/typescript.md#analyzability:
     * - "Export narrow interfaces/types; keep implementation details internal"
     *
     * Internal implementation files should NOT be re-exported:
     * - Machine implementation details (state machine internals)
     * - Service adapter implementations
     * - Internal utility functions
     */
    it('does not export internal implementation details', () => {
      const exportedNames = Object.keys(PublicAPI);

      // Should NOT export internal machine implementation
      expect(exportedNames).not.toContain('uploadMachine');
      expect(exportedNames).not.toContain('createUploadMachine');

      // Should NOT export adapter implementations
      expect(exportedNames).not.toContain('uploadService');
      expect(exportedNames).not.toContain('notificationService');

      // Should NOT export internal component implementations
      expect(exportedNames).not.toContain('UploadButton');
    });
  });

  describe('API Completeness for Screens', () => {
    /**
     * Verify the public API provides everything screens need
     * Screens should never need to import from internal paths
     */
    it('provides dependency injection via ServiceProvider', () => {
      // Screens can wrap their tree with ServiceProvider from /public
      expect(PublicAPI.ServiceProvider).toBeDefined();
    });

    it('provides service access via useServices hook', () => {
      // Screens can access uploadService and notificationService
      expect(PublicAPI.useServices).toBeDefined();
    });

    it('provides upload orchestration via hooks', () => {
      // Screens can orchestrate uploads using public hooks
      expect(PublicAPI.useUpload).toBeDefined();
      expect(PublicAPI.useUploadMachine).toBeDefined();
    });

    it('provides network calls via RTK Query hooks', () => {
      // Screens can make API calls using exported query/mutation hooks
      expect(PublicAPI.useRequestPresignUrlMutation).toBeDefined();
      expect(PublicAPI.useGetJobStatusQuery).toBeDefined();
    });

    it('provides state machine utilities', () => {
      // Screens can check upload state using exported helpers
      expect(PublicAPI.isUploadInProgress).toBeDefined();
      expect(PublicAPI.isUploadPauseable).toBeDefined();
      expect(PublicAPI.isUploadTerminal).toBeDefined();
    });
  });
});
