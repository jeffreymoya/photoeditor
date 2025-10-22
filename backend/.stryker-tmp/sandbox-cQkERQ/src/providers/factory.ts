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
    if (stryMutAct_9fa48("15")) {
      {}
    } else {
      stryCov_9fa48("15");
      if (stryMutAct_9fa48("18") ? false : stryMutAct_9fa48("17") ? true : stryMutAct_9fa48("16") ? ProviderFactory.instance : (stryCov_9fa48("16", "17", "18"), !ProviderFactory.instance)) {
        if (stryMutAct_9fa48("19")) {
          {}
        } else {
          stryCov_9fa48("19");
          ProviderFactory.instance = new ProviderFactory();
        }
      }
      return ProviderFactory.instance;
    }
  }
  initialize(config: ProviderFactoryConfig): void {
    if (stryMutAct_9fa48("20")) {
      {}
    } else {
      stryCov_9fa48("20");
      this.analysisProvider = this.createAnalysisProvider(config.analysis.provider, config.analysis.config);
      this.editingProvider = this.createEditingProvider(config.editing.provider, config.editing.config);
    }
  }
  getAnalysisProvider(): AnalysisProvider {
    if (stryMutAct_9fa48("21")) {
      {}
    } else {
      stryCov_9fa48("21");
      if (stryMutAct_9fa48("24") ? false : stryMutAct_9fa48("23") ? true : stryMutAct_9fa48("22") ? this.analysisProvider : (stryCov_9fa48("22", "23", "24"), !this.analysisProvider)) {
        if (stryMutAct_9fa48("25")) {
          {}
        } else {
          stryCov_9fa48("25");
          throw new Error(stryMutAct_9fa48("26") ? "" : (stryCov_9fa48("26"), 'Analysis provider not initialized. Call initialize() first.'));
        }
      }
      return this.analysisProvider;
    }
  }
  getEditingProvider(): EditingProvider {
    if (stryMutAct_9fa48("27")) {
      {}
    } else {
      stryCov_9fa48("27");
      if (stryMutAct_9fa48("30") ? false : stryMutAct_9fa48("29") ? true : stryMutAct_9fa48("28") ? this.editingProvider : (stryCov_9fa48("28", "29", "30"), !this.editingProvider)) {
        if (stryMutAct_9fa48("31")) {
          {}
        } else {
          stryCov_9fa48("31");
          throw new Error(stryMutAct_9fa48("32") ? "" : (stryCov_9fa48("32"), 'Editing provider not initialized. Call initialize() first.'));
        }
      }
      return this.editingProvider;
    }
  }
  private createAnalysisProvider(type: 'gemini' | 'stub', config: ProviderConfig): AnalysisProvider {
    if (stryMutAct_9fa48("33")) {
      {}
    } else {
      stryCov_9fa48("33");
      switch (type) {
        case stryMutAct_9fa48("35") ? "" : (stryCov_9fa48("35"), 'gemini'):
          if (stryMutAct_9fa48("34")) {} else {
            stryCov_9fa48("34");
            return new GeminiProvider(config);
          }
        case stryMutAct_9fa48("37") ? "" : (stryCov_9fa48("37"), 'stub'):
          if (stryMutAct_9fa48("36")) {} else {
            stryCov_9fa48("36");
            return new StubAnalysisProvider(config);
          }
        default:
          if (stryMutAct_9fa48("38")) {} else {
            stryCov_9fa48("38");
            throw new Error(stryMutAct_9fa48("39") ? `` : (stryCov_9fa48("39"), `Unknown analysis provider type: ${type}`));
          }
      }
    }
  }
  private createEditingProvider(type: 'seedream' | 'stub', config: ProviderConfig): EditingProvider {
    if (stryMutAct_9fa48("40")) {
      {}
    } else {
      stryCov_9fa48("40");
      switch (type) {
        case stryMutAct_9fa48("42") ? "" : (stryCov_9fa48("42"), 'seedream'):
          if (stryMutAct_9fa48("41")) {} else {
            stryCov_9fa48("41");
            return new SeedreamProvider(config);
          }
        case stryMutAct_9fa48("44") ? "" : (stryCov_9fa48("44"), 'stub'):
          if (stryMutAct_9fa48("43")) {} else {
            stryCov_9fa48("43");
            return new StubEditingProvider(config);
          }
        default:
          if (stryMutAct_9fa48("45")) {} else {
            stryCov_9fa48("45");
            throw new Error(stryMutAct_9fa48("46") ? `` : (stryCov_9fa48("46"), `Unknown editing provider type: ${type}`));
          }
      }
    }
  }
  async healthCheck(): Promise<{
    analysis: boolean;
    editing: boolean;
  }> {
    if (stryMutAct_9fa48("47")) {
      {}
    } else {
      stryCov_9fa48("47");
      const [analysisHealthy, editingHealthy] = await Promise.all(stryMutAct_9fa48("48") ? [] : (stryCov_9fa48("48"), [stryMutAct_9fa48("49") ? this.analysisProvider?.isHealthy() && false : (stryCov_9fa48("49"), (stryMutAct_9fa48("50") ? this.analysisProvider.isHealthy() : (stryCov_9fa48("50"), this.analysisProvider?.isHealthy())) ?? (stryMutAct_9fa48("51") ? true : (stryCov_9fa48("51"), false))), stryMutAct_9fa48("52") ? this.editingProvider?.isHealthy() && false : (stryCov_9fa48("52"), (stryMutAct_9fa48("53") ? this.editingProvider.isHealthy() : (stryCov_9fa48("53"), this.editingProvider?.isHealthy())) ?? (stryMutAct_9fa48("54") ? true : (stryCov_9fa48("54"), false)))]));
      return stryMutAct_9fa48("55") ? {} : (stryCov_9fa48("55"), {
        analysis: analysisHealthy,
        editing: editingHealthy
      });
    }
  }
}