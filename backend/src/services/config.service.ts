import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export class ConfigService {
  private ssmClient: SSMClient;
  private projectName: string;
  private environment: string;

  constructor(region: string, projectName: string, environment: string) {
    this.ssmClient = new SSMClient({ region });
    this.projectName = projectName;
    this.environment = environment;
  }

  private getParameterName(key: string): string {
    return `/${this.projectName}-${this.environment}/${key}`;
  }

  async getParameter(key: string, withDecryption: boolean = false): Promise<string | null> {
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

  async isStubProvidersEnabled(): Promise<boolean> {
    const value = await this.getParameter('providers/enable-stubs');
    return value === 'true';
  }

  async getGeminiApiKey(): Promise<string | null> {
    return this.getParameter('gemini/api-key', true);
  }

  async getSeedreamApiKey(): Promise<string | null> {
    return this.getParameter('seedream/api-key', true);
  }

  async getGeminiEndpoint(): Promise<string | null> {
    return this.getParameter('gemini/endpoint');
  }

  async getSeedreamEndpoint(): Promise<string | null> {
    return this.getParameter('seedream/endpoint');
  }

  async getAnalysisProviderName(): Promise<string> {
    const providerName = await this.getParameter('providers/analysis');
    return providerName || 'gemini'; // Default to 'gemini' if not set
  }

  async getEditingProviderName(): Promise<string> {
    const providerName = await this.getParameter('providers/editing');
    return providerName || 'seedream'; // Default to 'seedream' if not set
  }
}