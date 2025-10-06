/**
 * Provider Test Doubles for Integration Tests
 *
 * Provides deterministic, controllable stubs for Gemini and Seedream providers
 * that align with @photoeditor/shared schemas and capture invocations for assertions.
 *
 * Per STANDARDS.md line 83: Structured logs with correlationId for test verification
 * Per testing-standards.md: Stubs must validate against contract tests to prevent drift
 */

import { AnalysisProvider } from '../../src/providers/analysis.provider';
import { EditingProvider } from '../../src/providers/editing.provider';
import {
  GeminiAnalysisRequest,
  GeminiAnalysisResponse,
  SeedreamEditingRequest,
  SeedreamEditingResponse,
  ProviderResponse,
  ProviderConfig
} from '@photoeditor/shared';

export interface ProviderInvocation {
  timestamp: number;
  request: unknown;
  response: ProviderResponse;
}

/**
 * Controllable stub for analysis provider with invocation tracking
 */
export class TestAnalysisProvider implements AnalysisProvider {
  private invocations: ProviderInvocation[] = [];
  private shouldFail = false;
  private failureMessage = 'Analysis provider error';
  private responseDelay = 0;
  private customResponse?: GeminiAnalysisResponse;

  constructor(_config: ProviderConfig) {}

  async analyzeImage(request: GeminiAnalysisRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Simulate processing delay if configured
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    const duration = Date.now() - startTime;
    let response: ProviderResponse;

    if (this.shouldFail) {
      response = {
        success: false,
        error: this.failureMessage,
        duration,
        provider: 'TestAnalysis',
        timestamp: new Date().toISOString(),
        data: undefined
      };
    } else {
      const analysisResponse: GeminiAnalysisResponse = this.customResponse || {
        analysis: `Professional photo analysis: The image shows good composition with natural lighting. Recommendations: Increase contrast by 15%, enhance colors in the midtone range, apply slight sharpening to enhance details, and adjust white balance for warmer tones.`,
        confidence: 0.92,
        metadata: {
          model: 'test-gemini-flash',
          processingTime: this.responseDelay,
          requestId: 'test-req-001'
        }
      };

      response = {
        success: true,
        data: analysisResponse,
        duration,
        provider: 'TestAnalysis',
        timestamp: new Date().toISOString()
      };
    }

    // Record invocation for assertions
    this.invocations.push({
      timestamp: Date.now(),
      request,
      response
    });

    return response;
  }

  getName(): string {
    return 'TestAnalysis';
  }

  async isHealthy(): Promise<boolean> {
    return !this.shouldFail;
  }

  // Test control methods
  setShouldFail(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) {
      this.failureMessage = message;
    }
  }

  setResponseDelay(delayMs: number): void {
    this.responseDelay = delayMs;
  }

  setCustomResponse(response: GeminiAnalysisResponse): void {
    this.customResponse = response;
  }

  getInvocations(): ProviderInvocation[] {
    return [...this.invocations];
  }

  getLastInvocation(): ProviderInvocation | null {
    return this.invocations.length > 0 ? this.invocations[this.invocations.length - 1] : null;
  }

  reset(): void {
    this.invocations = [];
    this.shouldFail = false;
    this.failureMessage = 'Analysis provider error';
    this.responseDelay = 0;
    this.customResponse = undefined;
  }
}

/**
 * Controllable stub for editing provider with invocation tracking
 */
export class TestEditingProvider implements EditingProvider {
  private invocations: ProviderInvocation[] = [];
  private shouldFail = false;
  private failureMessage = 'Editing provider error';
  private responseDelay = 0;
  private customResponse?: SeedreamEditingResponse;

  constructor(_config: ProviderConfig) {}

  async editImage(request: SeedreamEditingRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Simulate processing delay if configured
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    const duration = Date.now() - startTime;
    let response: ProviderResponse;

    if (this.shouldFail) {
      response = {
        success: false,
        error: this.failureMessage,
        duration,
        provider: 'TestEditing',
        timestamp: new Date().toISOString(),
        data: undefined
      };
    } else {
      const editingResponse: SeedreamEditingResponse = this.customResponse || {
        editedImageUrl: `https://test-edited.example.com/images/${Date.now()}.jpg`,
        processingTime: this.responseDelay,
        metadata: {
          version: 'test-seedream-4.0',
          format: 'jpeg',
          quality: 'high',
          original_analysis: request.analysis,
          editing_instructions: request.editingInstructions,
          requestId: 'test-edit-001'
        }
      };

      response = {
        success: true,
        data: editingResponse,
        duration,
        provider: 'TestEditing',
        timestamp: new Date().toISOString()
      };
    }

    // Record invocation for assertions
    this.invocations.push({
      timestamp: Date.now(),
      request,
      response
    });

    return response;
  }

  getName(): string {
    return 'TestEditing';
  }

  async isHealthy(): Promise<boolean> {
    return !this.shouldFail;
  }

  // Test control methods
  setShouldFail(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) {
      this.failureMessage = message;
    }
  }

  setResponseDelay(delayMs: number): void {
    this.responseDelay = delayMs;
  }

  setCustomResponse(response: SeedreamEditingResponse): void {
    this.customResponse = response;
  }

  getInvocations(): ProviderInvocation[] {
    return [...this.invocations];
  }

  getLastInvocation(): ProviderInvocation | null {
    return this.invocations.length > 0 ? this.invocations[this.invocations.length - 1] : null;
  }

  reset(): void {
    this.invocations = [];
    this.shouldFail = false;
    this.failureMessage = 'Editing provider error';
    this.responseDelay = 0;
    this.customResponse = undefined;
  }
}

/**
 * Factory for creating test providers with shared configuration
 */
export class TestProviderFactory {
  private analysisProvider: TestAnalysisProvider;
  private editingProvider: TestEditingProvider;

  constructor() {
    const config: ProviderConfig = {
      name: 'TestProvider',
      apiKey: 'test-api-key',
      baseUrl: 'https://test-provider.example.com',
      timeout: 5000,
      retries: 2,
      enabled: true
    };

    this.analysisProvider = new TestAnalysisProvider(config);
    this.editingProvider = new TestEditingProvider(config);
  }

  getAnalysisProvider(): TestAnalysisProvider {
    return this.analysisProvider;
  }

  getEditingProvider(): TestEditingProvider {
    return this.editingProvider;
  }

  reset(): void {
    this.analysisProvider.reset();
    this.editingProvider.reset();
  }
}
