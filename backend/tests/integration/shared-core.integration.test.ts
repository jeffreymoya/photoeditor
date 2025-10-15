/**
 * Integration tests for shared core library
 * Tests provider swap, configuration loading, and factory initialization
 */

import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import { createSSMClient } from '../../libs/core/aws';
import { ConfigService } from '../../libs/core/config';
import { BootstrapService, StandardProviderCreator } from '../../libs/core/providers';
import { setupLocalStackEnv, waitForLocalStack } from './setup';

describe('Shared Core Integration Tests', () => {
  let ssmClient: SSMClient;
  const projectName = 'test-project';
  const environment = 'integration-test';
  const paramPrefix = `/${projectName}-${environment}`;

  beforeAll(async () => {
    setupLocalStackEnv();
    await waitForLocalStack();
    ssmClient = createSSMClient('us-east-1');

    // Set up test parameters in SSM
    const params = [
      { key: 'providers/enable-stubs', value: 'false' },
      { key: 'providers/analysis', value: 'gemini' },
      { key: 'providers/editing', value: 'seedream' },
      { key: 'gemini/api-key', value: 'test-gemini-key', secure: true },
      { key: 'gemini/endpoint', value: 'https://test-gemini.endpoint' },
      { key: 'seedream/api-key', value: 'test-seedream-key', secure: true },
      { key: 'seedream/endpoint', value: 'https://test-seedream.endpoint' }
    ];

    for (const param of params) {
      try {
        await ssmClient.send(new PutParameterCommand({
          Name: `${paramPrefix}/${param.key}`,
          Value: param.value,
          Type: param.secure ? 'SecureString' : 'String',
          Overwrite: true
        }));
      } catch (error) {
        // Ignore errors for existing parameters
      }
    }
  });

  afterAll(async () => {
    if (!ssmClient) {
      return;
    }
    // Clean up test parameters
    const paramKeys = [
      'providers/enable-stubs',
      'providers/analysis',
      'providers/editing',
      'gemini/api-key',
      'gemini/endpoint',
      'seedream/api-key',
      'seedream/endpoint'
    ];

    for (const key of paramKeys) {
      try {
        await ssmClient.send(new DeleteParameterCommand({
          Name: `${paramPrefix}/${key}`
        }));
      } catch (error) {
        // Ignore errors for non-existent parameters
      }
    }
  });

  describe('Provider Swap', () => {
    it('should initialize with real providers', async () => {
      const configService = new ConfigService(ssmClient, projectName, environment);
      const providerCreator = new StandardProviderCreator();
      const bootstrapService = new BootstrapService(configService, providerCreator);

      const factory = await bootstrapService.initializeProviders();

      expect(factory).toBeDefined();
      expect(factory.getAnalysisProvider()).toBeDefined();
      expect(factory.getEditingProvider()).toBeDefined();

      const analysisProvider = factory.getAnalysisProvider();
      const editingProvider = factory.getEditingProvider();

      expect(analysisProvider.getName()).toBe('Gemini');
      expect(editingProvider.getName()).toBe('Seedream');
    });

    it('should initialize with stub providers when enabled', async () => {
      // Enable stub providers
      await ssmClient.send(new PutParameterCommand({
        Name: `${paramPrefix}/providers/enable-stubs`,
        Value: 'true',
        Type: 'String',
        Overwrite: true
      }));

      const configService = new ConfigService(ssmClient, projectName, environment);
      const providerCreator = new StandardProviderCreator();
      const bootstrapService = new BootstrapService(configService, providerCreator);

      const factory = await bootstrapService.initializeProviders();

      expect(factory).toBeDefined();

      const analysisProvider = factory.getAnalysisProvider();
      const editingProvider = factory.getEditingProvider();

      expect(analysisProvider.getName()).toBe('StubAnalysis');
      expect(editingProvider.getName()).toBe('StubEditing');

      // Restore real providers
      await ssmClient.send(new PutParameterCommand({
        Name: `${paramPrefix}/providers/enable-stubs`,
        Value: 'false',
        Type: 'String',
        Overwrite: true
      }));
    });

    it('should perform health checks on providers', async () => {
      const configService = new ConfigService(ssmClient, projectName, environment);
      const providerCreator = new StandardProviderCreator();
      const bootstrapService = new BootstrapService(configService, providerCreator);

      const factory = await bootstrapService.initializeProviders();
      const health = await factory.healthCheck();

      expect(health).toHaveProperty('analysis');
      expect(health).toHaveProperty('editing');
      expect(typeof health.analysis).toBe('boolean');
      expect(typeof health.editing).toBe('boolean');
    });
  });

  describe('Configuration Service', () => {
    it('should load configuration from SSM', async () => {
      const configService = new ConfigService(ssmClient, projectName, environment);

      const analysisProvider = await configService.getAnalysisProviderName();
      const editingProvider = await configService.getEditingProviderName();

      expect(analysisProvider).toBe('gemini');
      expect(editingProvider).toBe('seedream');
    });

    it('should load secure parameters', async () => {
      const configService = new ConfigService(ssmClient, projectName, environment);

      const apiKey = await configService.getGeminiApiKey();

      expect(apiKey).toBe('test-gemini-key');
    });
  });
});
