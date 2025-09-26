import { SeedreamEditingRequest, SeedreamEditingResponse, ProviderResponse } from '@photoeditor/shared';

export interface EditingProvider {
  editImage(request: SeedreamEditingRequest): Promise<ProviderResponse>;
  getName(): string;
  isHealthy(): Promise<boolean>;
}