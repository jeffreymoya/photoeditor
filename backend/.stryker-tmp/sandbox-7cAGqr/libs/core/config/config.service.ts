/**
 * Configuration Service
 *
 * Centralized configuration loading from AWS Systems Manager Parameter Store.
 * Supports environment-specific parameter paths and secure parameter decryption.
 *
 * This service ensures:
 * - Single source of truth for configuration (STANDARDS.md line 90)
 * - No hardcoded secrets (STANDARDS.md line 41)
 * - Environment-specific configuration isolation
 *
 * @module core/config
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

/**
 * Configuration service for loading parameters from SSM Parameter Store
 */
export class ConfigService {
  private ssmClient: SSMClient;
  private projectName: string;
  private environment: string;

  /**
   * Creates a new ConfigService instance
   *
   * @param ssmClient - Configured SSM client (injected for testability)
   * @param projectName - Project name for parameter path namespacing
   * @param environment - Environment name (dev, staging, prod)
   */
  constructor(ssmClient: SSMClient, projectName: string, environment: string) {
    this.ssmClient = ssmClient;
    this.projectName = projectName;
    this.environment = environment;
  }

  /**
   * Constructs the full parameter name with project/environment prefix
   *
   * @param key - Parameter key
   * @returns Full parameter path
   */
  private getParameterName(key: string): string {
    return `/${this.projectName}-${this.environment}/${key}`;
  }

  /**
   * Retrieves a parameter from SSM Parameter Store
   *
   * @param key - Parameter key
   * @param withDecryption - Whether to decrypt SecureString parameters
   * @returns Parameter value or null if not found
   */
  async getParameter(key: string, withDecryption = false): Promise<string | null> {
    try {
      const command = new GetParameterCommand({
        Name: this.getParameterName(key),
        WithDecryption: withDecryption
      });

      const response = await this.ssmClient.send(command);
      return response.Parameter?.Value || null;
    } catch (error) {
      if ((error as { name: string }).name === 'ParameterNotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Checks if stub providers should be used (for testing/development)
   *
   * @returns True if stub providers are enabled
   */
  async isStubProvidersEnabled(): Promise<boolean> {
    const value = await this.getParameter('providers/enable-stubs');
    return value === 'true';
  }

  /**
   * Retrieves the Gemini API key
   *
   * @returns Gemini API key or null if not configured
   */
  async getGeminiApiKey(): Promise<string | null> {
    return this.getParameter('gemini/api-key', true);
  }

  /**
   * Retrieves the Seedream API key
   *
   * @returns Seedream API key or null if not configured
   */
  async getSeedreamApiKey(): Promise<string | null> {
    return this.getParameter('seedream/api-key', true);
  }

  /**
   * Retrieves the Gemini endpoint URL
   *
   * @returns Gemini endpoint URL or null if not configured
   */
  async getGeminiEndpoint(): Promise<string | null> {
    return this.getParameter('gemini/endpoint');
  }

  /**
   * Retrieves the Seedream endpoint URL
   *
   * @returns Seedream endpoint URL or null if not configured
   */
  async getSeedreamEndpoint(): Promise<string | null> {
    return this.getParameter('seedream/endpoint');
  }

  /**
   * Retrieves the configured analysis provider name
   *
   * @returns Analysis provider name (defaults to 'gemini')
   */
  async getAnalysisProviderName(): Promise<string> {
    const providerName = await this.getParameter('providers/analysis');
    return providerName || 'gemini';
  }

  /**
   * Retrieves the configured editing provider name
   *
   * @returns Editing provider name (defaults to 'seedream')
   */
  async getEditingProviderName(): Promise<string> {
    const providerName = await this.getParameter('providers/editing');
    return providerName || 'seedream';
  }
}
