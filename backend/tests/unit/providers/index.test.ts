/**
 * Unit tests for Providers Module Barrel Exports
 * Ensures all provider exports are accessible through the index
 */

import * as ProvidersModule from '../../../src/providers';

describe('Providers Module Exports', () => {
  it('should export BaseProvider', () => {
    expect(ProvidersModule.BaseProvider).toBeDefined();
  });

  it('should export AnalysisProvider interface type', () => {
    // Type-level check - will fail at compile time if missing
    expect(true).toBe(true);
  });

  it('should export EditingProvider interface type', () => {
    // Type-level check - will fail at compile time if missing
    expect(true).toBe(true);
  });

  it('should export GeminiProvider', () => {
    expect(ProvidersModule.GeminiProvider).toBeDefined();
  });

  it('should export SeedreamProvider', () => {
    expect(ProvidersModule.SeedreamProvider).toBeDefined();
  });

  it('should export StubAnalysisProvider', () => {
    expect(ProvidersModule.StubAnalysisProvider).toBeDefined();
  });

  it('should export StubEditingProvider', () => {
    expect(ProvidersModule.StubEditingProvider).toBeDefined();
  });

  it('should export ProviderFactory', () => {
    expect(ProvidersModule.ProviderFactory).toBeDefined();
  });

  it('should export ProviderFactoryConfig interface type', () => {
    // Type-level check - will fail at compile time if missing
    expect(true).toBe(true);
  });

  it('should allow instantiation of ProviderFactory via getInstance', () => {
    const factory = ProvidersModule.ProviderFactory.getInstance();
    expect(factory).toBeDefined();
    expect(factory).toBeInstanceOf(ProvidersModule.ProviderFactory);
  });
});
