import { BaseProvider } from './base.provider';
import { AnalysisProvider } from './analysis.provider';
import {
  GeminiAnalysisRequest,
  GeminiAnalysisResponse,
  ProviderResponse,
  ProviderConfig,
  PROVIDER_CONFIG
} from '@photoeditor/shared';

export class GeminiProvider extends BaseProvider implements AnalysisProvider {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      name: 'Gemini',
      timeout: config.timeout || PROVIDER_CONFIG.GEMINI.TIMEOUT_MS,
      retries: config.retries || PROVIDER_CONFIG.GEMINI.MAX_RETRIES
    });
  }

  async analyzeImage(request: GeminiAnalysisRequest): Promise<ProviderResponse> {
    return this.makeRequest(async () => {
      const response = await fetch(`${this.config.baseUrl}/v1/models/${PROVIDER_CONFIG.GEMINI.MODEL}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: request.prompt || PROVIDER_CONFIG.GEMINI.DEFAULT_PROMPT
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: await this.fetchImageAsBase64(request.imageUrl)
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            candidateCount: 1,
            maxOutputTokens: 1000
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No analysis returned from Gemini');
      }

      const analysis = data.candidates[0].content.parts[0].text;
      const confidence = data.candidates[0].finishReason === 'STOP' ? 0.9 : 0.7;

      return {
        analysis,
        confidence,
        metadata: {
          model: PROVIDER_CONFIG.GEMINI.MODEL,
          finishReason: data.candidates[0].finishReason,
          safetyRatings: data.candidates[0].safetyRatings
        }
      } as GeminiAnalysisResponse;
    }, 'analyzeImage');
  }

  private async fetchImageAsBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  getName(): string {
    return 'Gemini';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
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