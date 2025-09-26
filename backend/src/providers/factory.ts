import { AnalysisProvider } from './analysis.provider';
import { EditingProvider } from './editing.provider';
import { GeminiProvider } from './gemini.provider';
import { SeedreamProvider } from './seedream.provider';
import { StubAnalysisProvider, StubEditingProvider } from './stub.providers';
import { ProviderConfig } from '@photoeditor/shared';

export interface ProviderFactoryConfig {
  analysis: {
    provider: 'gemini' | 'stub';
    config: ProviderConfig;
  };
  editing: {
    provider: 'seedream' | 'stub';
    config: ProviderConfig;
  };
}

export class ProviderFactory {
  private static instance: ProviderFactory;
  private analysisProvider: AnalysisProvider | null = null;
  private editingProvider: EditingProvider | null = null;

  private constructor() {}

  static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  initialize(config: ProviderFactoryConfig): void {
    this.analysisProvider = this.createAnalysisProvider(
      config.analysis.provider,
      config.analysis.config
    );

    this.editingProvider = this.createEditingProvider(
      config.editing.provider,
      config.editing.config
    );
  }

  getAnalysisProvider(): AnalysisProvider {
    if (!this.analysisProvider) {
      throw new Error('Analysis provider not initialized. Call initialize() first.');
    }
    return this.analysisProvider;
  }

  getEditingProvider(): EditingProvider {
    if (!this.editingProvider) {
      throw new Error('Editing provider not initialized. Call initialize() first.');
    }
    return this.editingProvider;
  }

  private createAnalysisProvider(type: 'gemini' | 'stub', config: ProviderConfig): AnalysisProvider {
    switch (type) {
      case 'gemini':
        return new GeminiProvider(config);
      case 'stub':
        return new StubAnalysisProvider(config);
      default:
        throw new Error(`Unknown analysis provider type: ${type}`);
    }
  }

  private createEditingProvider(type: 'seedream' | 'stub', config: ProviderConfig): EditingProvider {
    switch (type) {
      case 'seedream':
        return new SeedreamProvider(config);
      case 'stub':
        return new StubEditingProvider(config);
      default:
        throw new Error(`Unknown editing provider type: ${type}`);
    }
  }

  async healthCheck(): Promise<{ analysis: boolean; editing: boolean }> {
    const [analysisHealthy, editingHealthy] = await Promise.all([
      this.analysisProvider?.isHealthy() ?? false,
      this.editingProvider?.isHealthy() ?? false
    ]);

    return {
      analysis: analysisHealthy,
      editing: editingHealthy
    };
  }
}