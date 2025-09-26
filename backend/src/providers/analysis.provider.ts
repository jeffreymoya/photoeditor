import { GeminiAnalysisRequest, GeminiAnalysisResponse, ProviderResponse } from '@photoeditor/shared';

export interface AnalysisProvider {
  analyzeImage(request: GeminiAnalysisRequest): Promise<ProviderResponse>;
  getName(): string;
  isHealthy(): Promise<boolean>;
}