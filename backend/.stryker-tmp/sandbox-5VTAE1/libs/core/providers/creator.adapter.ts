/**
 * Provider Creator Adapter
 *
 * Adapter that bridges the core provider factory with the existing provider
 * implementations. This allows the core library to remain framework-agnostic
 * while delegating actual provider construction to the application layer.
 *
 * This adapter ensures:
 * - Core library remains pure (no app-specific provider imports)
 * - Existing provider implementations are reused
 * - Dependency injection for testability
 *
 * @module core/providers
 */
// @ts-nocheck


import { ProviderConfig } from '@photoeditor/shared';
import { ProviderCreator } from './bootstrap.service';

/**
 * Standard provider creator that imports and instantiates actual provider classes
 *
 * This adapter is used by the application to wire up real provider implementations
 * from the src/providers directory.
 */
export class StandardProviderCreator implements ProviderCreator {
  /**
   * Creates an analysis provider instance
   *
   * @param type - Provider type ('gemini' or 'stub')
   * @param config - Provider configuration
   * @returns Analysis provider instance
   */
  createAnalysisProvider(type: 'gemini' | 'stub', config: ProviderConfig): any {
    // Dynamic import to avoid circular dependencies and keep core pure
    // These imports are resolved at runtime by the application layer
    switch (type) {
      case 'gemini': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GeminiProvider } = require('../../../src/providers/gemini.provider');
        return new GeminiProvider(config);
      }
      case 'stub': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StubAnalysisProvider } = require('../../../src/providers/stub.providers');
        return new StubAnalysisProvider(config);
      }
      default:
        throw new Error(`Unknown analysis provider type: ${type}`);
    }
  }

  /**
   * Creates an editing provider instance
   *
   * @param type - Provider type ('seedream' or 'stub')
   * @param config - Provider configuration
   * @returns Editing provider instance
   */
  createEditingProvider(type: 'seedream' | 'stub', config: ProviderConfig): any {
    // Dynamic import to avoid circular dependencies and keep core pure
    switch (type) {
      case 'seedream': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SeedreamProvider } = require('../../../src/providers/seedream.provider');
        return new SeedreamProvider(config);
      }
      case 'stub': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StubEditingProvider } = require('../../../src/providers/stub.providers');
        return new StubEditingProvider(config);
      }
      default:
        throw new Error(`Unknown editing provider type: ${type}`);
    }
  }
}
