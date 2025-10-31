/**
 * Unit tests for ConfigService
 * Tests parameter loading from SSM Parameter Store
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { ConfigService } from '../../../src/services/config.service';

const ssmMock = mockClient(SSMClient);

describe('ConfigService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    ssmMock.reset();
    configService = new ConfigService('us-east-1', 'photoeditor', 'dev');
  });

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      const service = new ConfigService('us-west-2', 'test-project', 'staging');
      expect(service).toBeInstanceOf(ConfigService);
    });
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
      expect(ssmMock.commandCalls(GetParameterCommand).length).toBe(1);
    });

    it('should use correct parameter name format', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {
          Value: 'test-value'
        }
      });

      await configService.getParameter('test-key');

      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/test-key');
    });

    it('should support withDecryption parameter', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {
          Value: 'encrypted-value'
        }
      });

      await configService.getParameter('secure-key', true);

      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.WithDecryption).toBe(true);
    });

    it('should default withDecryption to false', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {
          Value: 'value'
        }
      });

      await configService.getParameter('key');

      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.WithDecryption).toBe(false);
    });

    it('should return null for non-existent parameter', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound',
        message: 'Parameter not found'
      });

      const result = await configService.getParameter('missing-key');

      expect(result).toBeNull();
    });

    it('should return null when Parameter.Value is undefined', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {}
      });

      const result = await configService.getParameter('key-without-value');

      expect(result).toBeNull();
    });

    it('should throw for other SSM errors', async () => {
      ssmMock.on(GetParameterCommand).rejects(new Error('Access denied'));

      await expect(configService.getParameter('test-key')).rejects.toThrow('Access denied');
    });

    it('should throw for throttling errors', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ThrottlingException',
        message: 'Rate exceeded'
      });

      await expect(configService.getParameter('test-key')).rejects.toThrow('Rate exceeded');
    });
  });

  describe('isStubProvidersEnabled', () => {
    it('should return true when parameter is "true"', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'true' }
      });

      const result = await configService.isStubProvidersEnabled();

      expect(result).toBe(true);
    });

    it('should return false when parameter is "false"', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'false' }
      });

      const result = await configService.isStubProvidersEnabled();

      expect(result).toBe(false);
    });

    it('should return false when parameter is not set', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: undefined }
      });

      const result = await configService.isStubProvidersEnabled();

      expect(result).toBe(false);
    });

    it('should return false for any non-"true" value', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'yes' }
      });

      const result = await configService.isStubProvidersEnabled();

      expect(result).toBe(false);
    });
  });

  describe('getGeminiApiKey', () => {
    it('should retrieve Gemini API key with decryption', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'gemini-key-12345' }
      });

      const result = await configService.getGeminiApiKey();

      expect(result).toBe('gemini-key-12345');
      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.WithDecryption).toBe(true);
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/gemini/api-key');
    });

    it('should return null when Gemini API key is not configured', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
      });

      const result = await configService.getGeminiApiKey();

      expect(result).toBeNull();
    });
  });

  describe('getSeedreamApiKey', () => {
    it('should retrieve Seedream API key with decryption', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'seedream-key-67890' }
      });

      const result = await configService.getSeedreamApiKey();

      expect(result).toBe('seedream-key-67890');
      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.WithDecryption).toBe(true);
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/seedream/api-key');
    });

    it('should return null when Seedream API key is not configured', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
      });

      const result = await configService.getSeedreamApiKey();

      expect(result).toBeNull();
    });
  });

  describe('getGeminiEndpoint', () => {
    it('should retrieve Gemini endpoint', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'https://custom-gemini.example.com' }
      });

      const result = await configService.getGeminiEndpoint();

      expect(result).toBe('https://custom-gemini.example.com');
      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/gemini/endpoint');
    });

    it('should return null when endpoint is not configured', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
      });

      const result = await configService.getGeminiEndpoint();

      expect(result).toBeNull();
    });
  });

  describe('getSeedreamEndpoint', () => {
    it('should retrieve Seedream endpoint', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'https://custom-seedream.example.com' }
      });

      const result = await configService.getSeedreamEndpoint();

      expect(result).toBe('https://custom-seedream.example.com');
      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/seedream/endpoint');
    });

    it('should return null when endpoint is not configured', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
      });

      const result = await configService.getSeedreamEndpoint();

      expect(result).toBeNull();
    });
  });

  describe('getAnalysisProviderName', () => {
    it('should return configured provider name', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'gemini' }
      });

      const result = await configService.getAnalysisProviderName();

      expect(result).toBe('gemini');
      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/providers/analysis');
    });

    it('should return "gemini" as default when not configured', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: undefined }
      });

      const result = await configService.getAnalysisProviderName();

      expect(result).toBe('gemini');
    });

    it('should return "gemini" when parameter not found', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
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
      const call = ssmMock.commandCalls(GetParameterCommand)[0];
      expect(call.args[0].input.Name).toBe('/photoeditor-dev/providers/editing');
    });

    it('should return "seedream" as default when not configured', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: undefined }
      });

      const result = await configService.getEditingProviderName();

      expect(result).toBe('seedream');
    });

    it('should return "seedream" when parameter not found', async () => {
      ssmMock.on(GetParameterCommand).rejects({
        name: 'ParameterNotFound'
      });

      const result = await configService.getEditingProviderName();

      expect(result).toBe('seedream');
    });
  });
});
