// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { BaseProvider } from './base.provider';
import { AnalysisProvider } from './analysis.provider';
import { EditingProvider } from './editing.provider';
import { GeminiAnalysisRequest, GeminiAnalysisResponse, SeedreamEditingRequest, SeedreamEditingResponse, ProviderResponse, ProviderConfig } from '@photoeditor/shared';

// Stub Analysis Provider for testing/development
export class StubAnalysisProvider extends BaseProvider implements AnalysisProvider {
  constructor(config: ProviderConfig) {
    if (stryMutAct_9fa48("167")) {
      {}
    } else {
      stryCov_9fa48("167");
      super(stryMutAct_9fa48("168") ? {} : (stryCov_9fa48("168"), {
        ...config,
        name: stryMutAct_9fa48("169") ? "" : (stryCov_9fa48("169"), 'StubAnalysis'),
        timeout: 1000,
        retries: 1
      }));
    }
  }
  async analyzeImage(request: GeminiAnalysisRequest): Promise<ProviderResponse> {
    if (stryMutAct_9fa48("170")) {
      {}
    } else {
      stryCov_9fa48("170");
      return this.makeRequest(async () => {
        if (stryMutAct_9fa48("171")) {
          {}
        } else {
          stryCov_9fa48("171");
          // Simulate processing delay
          await new Promise(stryMutAct_9fa48("172") ? () => undefined : (stryCov_9fa48("172"), resolve => setTimeout(resolve, 500)));
          const response: GeminiAnalysisResponse = stryMutAct_9fa48("173") ? {} : (stryCov_9fa48("173"), {
            analysis: stryMutAct_9fa48("174") ? `` : (stryCov_9fa48("174"), `This is a simulated analysis of the image at ${request.imageUrl}. The image appears to be a photograph that could benefit from enhanced lighting, improved contrast, and color correction. The composition shows good framing and the subject matter is clear.`),
            confidence: 0.95,
            metadata: stryMutAct_9fa48("175") ? {} : (stryCov_9fa48("175"), {
              model: stryMutAct_9fa48("176") ? "" : (stryCov_9fa48("176"), 'stub-analysis-v1'),
              processingTime: 500
            })
          });
          return response;
        }
      });
    }
  }
  getName(): string {
    if (stryMutAct_9fa48("177")) {
      {}
    } else {
      stryCov_9fa48("177");
      return stryMutAct_9fa48("178") ? "" : (stryCov_9fa48("178"), 'StubAnalysis');
    }
  }
  async isHealthy(): Promise<boolean> {
    if (stryMutAct_9fa48("179")) {
      {}
    } else {
      stryCov_9fa48("179");
      return stryMutAct_9fa48("180") ? false : (stryCov_9fa48("180"), true);
    }
  }
}

// Stub Editing Provider for testing/development
export class StubEditingProvider extends BaseProvider implements EditingProvider {
  constructor(config: ProviderConfig) {
    if (stryMutAct_9fa48("181")) {
      {}
    } else {
      stryCov_9fa48("181");
      super(stryMutAct_9fa48("182") ? {} : (stryCov_9fa48("182"), {
        ...config,
        name: stryMutAct_9fa48("183") ? "" : (stryCov_9fa48("183"), 'StubEditing'),
        timeout: 2000,
        retries: 1
      }));
    }
  }
  async editImage(request: SeedreamEditingRequest): Promise<ProviderResponse> {
    if (stryMutAct_9fa48("184")) {
      {}
    } else {
      stryCov_9fa48("184");
      return this.makeRequest(async () => {
        if (stryMutAct_9fa48("185")) {
          {}
        } else {
          stryCov_9fa48("185");
          // Simulate processing delay
          await new Promise(stryMutAct_9fa48("186") ? () => undefined : (stryCov_9fa48("186"), resolve => setTimeout(resolve, 1500)));

          // Return the original image URL as "edited" for stub
          const response: SeedreamEditingResponse = stryMutAct_9fa48("187") ? {} : (stryCov_9fa48("187"), {
            editedImageUrl: request.imageUrl,
            processingTime: 1500,
            metadata: stryMutAct_9fa48("188") ? {} : (stryCov_9fa48("188"), {
              version: stryMutAct_9fa48("189") ? "" : (stryCov_9fa48("189"), 'stub-v1'),
              format: stryMutAct_9fa48("190") ? "" : (stryCov_9fa48("190"), 'jpeg'),
              quality: stryMutAct_9fa48("191") ? "" : (stryCov_9fa48("191"), 'high'),
              original_analysis: request.analysis,
              editing_instructions: request.editingInstructions
            })
          });
          return response;
        }
      });
    }
  }
  getName(): string {
    if (stryMutAct_9fa48("192")) {
      {}
    } else {
      stryCov_9fa48("192");
      return stryMutAct_9fa48("193") ? "" : (stryCov_9fa48("193"), 'StubEditing');
    }
  }
  async isHealthy(): Promise<boolean> {
    if (stryMutAct_9fa48("194")) {
      {}
    } else {
      stryCov_9fa48("194");
      return stryMutAct_9fa48("195") ? false : (stryCov_9fa48("195"), true);
    }
  }
}