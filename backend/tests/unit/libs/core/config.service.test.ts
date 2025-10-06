/**
 * Unit tests for ConfigService
 * Tests parameter loading from SSM Parameter Store
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { ConfigService } from '../../../../libs/core/config';

const ssmMock = mockClient(SSMClient);

describe('ConfigService', () => {
  let configService: ConfigService;
  let ssmClient: SSMClient;

  beforeEach(() => {
    ssmMock.reset();
    ssmClient = new SSMClient({ region: 'us-east-1' });
    configService = new ConfigService(ssmClient, 'test-project', 'dev');
  });

  describe('getParameter', () => {
    it('should retrieve parameter from SSM', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {
          Value: 'test-value'
        }
      });

      const result = await configService.getParameter('test-key');

      expect(result).toBe('test-value');
    });

    it('should return null for non-existent parameter', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
      });

      const result = await configService.getParameter('missing-key');

      expect(result).toBeNull();
    });

    it('should throw for other errors', async () => {
      ssmMock.on(GetParameterCommand).rejects(new Error('Access denied'));

      await expect(configService.getParameter('test-key')).rejects.toThrow('Access denied');
    });
  });

  describe('isStubProvidersEnabled', () => {
    it('should return true when enabled', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'true' }
      });

      const result = await configService.isStubProvidersEnabled();

      expect(result).toBe(true);
    });

    it('should return false when disabled', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'false' }
      });

      const result = await configService.isStubProvidersEnabled();

      expect(result).toBe(false);
    });
  });

  describe('getAnalysisProviderName', () => {
    it('should return configured provider name', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'gemini' }
      });

      const result = await configService.getAnalysisProviderName();

      expect(result).toBe('gemini');
    });

    it('should return default when not configured', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: null }
      });

      const result = await configService.getAnalysisProviderName();

      expect(result).toBe('gemini');
    });
  });

  describe('getEditingProviderName', () => {
    it('should return configured provider name', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'seedream' }
      });

      const result = await configService.getEditingProviderName();

      expect(result).toBe('seedream');
    });

    it('should return default when not configured', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: null }
      });

      const result = await configService.getEditingProviderName();

      expect(result).toBe('seedream');
    });
  });
});
