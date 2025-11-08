/**
 * Service Context for Dependency Injection
 *
 * Per the Frontend Tier standard Services & Integration Layer:
 * - Feature layer depends only on port interfaces, not concrete adapters
 * - React Context provides service injection to avoid prop drilling
 * - Enables testability: tests can inject stub implementations
 *
 * Per the TypeScript Standards:
 * - Named exports (no defaults in domain code)
 * - Strong typing (no any)
 */

import React, { createContext, useContext } from 'react';

import { notificationService } from '../../../services/notification/adapter';
import { uploadService } from '../../../services/upload/adapter';

import type { INotificationService } from '../../../services/notification/port';
import type { IUploadService } from '../../../services/upload/port';

/**
 * Service container interface
 *
 * Holds references to all services used by the upload feature.
 * Feature components depend only on port interfaces (IUploadService, INotificationService).
 */
export interface ServiceContainer {
  uploadService: IUploadService;
  notificationService: INotificationService;
}

/**
 * Service Context
 *
 * Provides service instances to feature components via React Context.
 * Default value uses production adapters; tests can override with stubs.
 */
const ServiceContext = createContext<ServiceContainer>({
  uploadService,
  notificationService,
});

/**
 * Service Provider Props
 */
export interface ServiceProviderProps {
  children: React.ReactNode;
  /**
   * Optional service overrides for testing
   */
  services?: Partial<ServiceContainer>;
}

/**
 * Service Provider Component
 *
 * Wraps feature tree and provides service instances via context.
 * In production: uses default adapters
 * In tests: can inject stub implementations via services prop
 *
 * @example
 * // Production usage
 * <ServiceProvider>
 *   <UploadScreen />
 * </ServiceProvider>
 *
 * @example
 * // Test usage with stubs
 * <ServiceProvider services={{ uploadService: stubUploadService }}>
 *   <UploadScreen />
 * </ServiceProvider>
 */
export function ServiceProvider({ children, services = {} }: ServiceProviderProps): React.JSX.Element {
  const container: ServiceContainer = {
    uploadService: services.uploadService ?? uploadService,
    notificationService: services.notificationService ?? notificationService,
  };

  return (
    <ServiceContext.Provider value={container}>
      {children}
    </ServiceContext.Provider>
  );
}

/**
 * Hook to access services from context
 *
 * Feature components use this hook to access service instances.
 * Components depend only on port interfaces, not concrete adapters.
 *
 * @returns Service container with uploadService and notificationService
 *
 * @example
 * function UploadButton() {
 *   const { uploadService } = useServices();
 *
 *   const handleUpload = async () => {
 *     await uploadService.processImage(...);
 *   };
 *
 *   return <Button onPress={handleUpload}>Upload</Button>;
 * }
 */
export function useServices(): ServiceContainer {
  const context = useContext(ServiceContext);

  if (!context) {
    throw new Error('useServices must be used within ServiceProvider');
  }

  return context;
}
