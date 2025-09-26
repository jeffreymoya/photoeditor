import { BaseProvider } from './base.provider';
import { AnalysisProvider } from './analysis.provider';
import { EditingProvider } from './editing.provider';
import {
  GeminiAnalysisRequest,
  GeminiAnalysisResponse,
  SeedreamEditingRequest,
  SeedreamEditingResponse,
  ProviderResponse,
  ProviderConfig
} from '@photoeditor/shared';

// Stub Analysis Provider for testing/development
export class StubAnalysisProvider extends BaseProvider implements AnalysisProvider {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      name: 'StubAnalysis',
      timeout: 1000,
      retries: 1
    });
  }

  async analyzeImage(request: GeminiAnalysisRequest): Promise<ProviderResponse> {
    return this.makeRequest(async () => {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        analysis: `This is a simulated analysis of the image at ${request.imageUrl}. The image appears to be a photograph that could benefit from enhanced lighting, improved contrast, and color correction. The composition shows good framing and the subject matter is clear.`,
        confidence: 0.95,
        metadata: {
          model: 'stub-analysis-v1',
          processingTime: 500
        }
      } as GeminiAnalysisResponse;
    }, 'analyzeImage');
  }

  getName(): string {
    return 'StubAnalysis';
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

// Stub Editing Provider for testing/development
export class StubEditingProvider extends BaseProvider implements EditingProvider {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      name: 'StubEditing',
      timeout: 2000,
      retries: 1
    });
  }

  async editImage(request: SeedreamEditingRequest): Promise<ProviderResponse> {
    return this.makeRequest(async () => {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Return the original image URL as "edited" for stub
      return {
        editedImageUrl: request.imageUrl,
        processingTime: 1500,
        metadata: {
          version: 'stub-v1',
          format: 'jpeg',
          quality: 'high',
          original_analysis: request.analysis,
          editing_instructions: request.editingInstructions
        }
      } as SeedreamEditingResponse;
    }, 'editImage');
  }

  getName(): string {
    return 'StubEditing';
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}