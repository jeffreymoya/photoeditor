import { BaseProvider } from './base.provider';
import { EditingProvider } from './editing.provider';
import {
  SeedreamEditingRequest,
  SeedreamEditingResponse,
  ProviderResponse,
  ProviderConfig,
  PROVIDER_CONFIG
} from '@photoeditor/shared';

export class SeedreamProvider extends BaseProvider implements EditingProvider {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      name: 'Seedream',
      timeout: config.timeout || PROVIDER_CONFIG.SEEDREAM.TIMEOUT_MS,
      retries: config.retries || PROVIDER_CONFIG.SEEDREAM.MAX_RETRIES
    });
  }

  async editImage(request: SeedreamEditingRequest): Promise<ProviderResponse> {
    return this.makeRequest(async () => {
      const response = await fetch(`${this.config.baseUrl}/v${PROVIDER_CONFIG.SEEDREAM.VERSION}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-API-Version': PROVIDER_CONFIG.SEEDREAM.VERSION
        },
        body: JSON.stringify({
          image_url: request.imageUrl,
          prompt: request.analysis,
          instructions: request.editingInstructions || 'Enhance and improve the image based on the analysis',
          quality: 'high',
          format: 'jpeg'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Seedream API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.edited_image_url) {
        throw new Error('No edited image URL returned from Seedream');
      }

      return {
        editedImageUrl: data.edited_image_url,
        processingTime: data.processing_time,
        metadata: {
          version: PROVIDER_CONFIG.SEEDREAM.VERSION,
          format: data.format,
          quality: data.quality,
          dimensions: data.dimensions,
          credits_used: data.credits_used
        }
      } as SeedreamEditingResponse;
    }, 'editImage');
  }

  getName(): string {
    return 'Seedream';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}