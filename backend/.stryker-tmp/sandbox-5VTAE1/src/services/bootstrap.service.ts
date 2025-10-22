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
import { ConfigService } from './config.service';
import { ProviderFactory, ProviderFactoryConfig } from '../providers/factory';
import { ProviderConfig } from '@photoeditor/shared';
export class BootstrapService {
  private configService: ConfigService;
  constructor(configService: ConfigService) {
    if (stryMutAct_9fa48("196")) {
      {}
    } else {
      stryCov_9fa48("196");
      this.configService = configService;
    }
  }
  async initializeProviders(): Promise<ProviderFactory> {
    if (stryMutAct_9fa48("197")) {
      {}
    } else {
      stryCov_9fa48("197");
      const factory = ProviderFactory.getInstance();

      // Check if stub providers should be used
      const useStubs = await this.configService.isStubProvidersEnabled();
      if (stryMutAct_9fa48("199") ? false : stryMutAct_9fa48("198") ? true : (stryCov_9fa48("198", "199"), useStubs)) {
        if (stryMutAct_9fa48("200")) {
          {}
        } else {
          stryCov_9fa48("200");
          // Use stub providers for testing
          const config: ProviderFactoryConfig = stryMutAct_9fa48("201") ? {} : (stryCov_9fa48("201"), {
            analysis: stryMutAct_9fa48("202") ? {} : (stryCov_9fa48("202"), {
              provider: stryMutAct_9fa48("203") ? "" : (stryCov_9fa48("203"), 'stub'),
              config: stryMutAct_9fa48("204") ? {} : (stryCov_9fa48("204"), {
                name: stryMutAct_9fa48("205") ? "" : (stryCov_9fa48("205"), 'stub-analysis'),
                baseUrl: stryMutAct_9fa48("206") ? "" : (stryCov_9fa48("206"), 'https://stub.endpoint'),
                apiKey: stryMutAct_9fa48("207") ? "" : (stryCov_9fa48("207"), 'stub'),
                timeout: 30000,
                retries: 3,
                enabled: stryMutAct_9fa48("208") ? false : (stryCov_9fa48("208"), true)
              })
            }),
            editing: stryMutAct_9fa48("209") ? {} : (stryCov_9fa48("209"), {
              provider: stryMutAct_9fa48("210") ? "" : (stryCov_9fa48("210"), 'stub'),
              config: stryMutAct_9fa48("211") ? {} : (stryCov_9fa48("211"), {
                name: stryMutAct_9fa48("212") ? "" : (stryCov_9fa48("212"), 'stub-editing'),
                baseUrl: stryMutAct_9fa48("213") ? "" : (stryCov_9fa48("213"), 'https://stub.endpoint'),
                apiKey: stryMutAct_9fa48("214") ? "" : (stryCov_9fa48("214"), 'stub'),
                timeout: 30000,
                retries: 3,
                enabled: stryMutAct_9fa48("215") ? false : (stryCov_9fa48("215"), true)
              })
            })
          });
          factory.initialize(config);
        }
      } else {
        if (stryMutAct_9fa48("216")) {
          {}
        } else {
          stryCov_9fa48("216");
          // Fetch provider names from SSM
          const [analysisProviderName, editingProviderName] = await Promise.all(stryMutAct_9fa48("217") ? [] : (stryCov_9fa48("217"), [this.configService.getAnalysisProviderName(), this.configService.getEditingProviderName()]));

          // Validate provider names
          const validAnalysisProviders = stryMutAct_9fa48("218") ? [] : (stryCov_9fa48("218"), [stryMutAct_9fa48("219") ? "" : (stryCov_9fa48("219"), 'gemini')]);
          const validEditingProviders = stryMutAct_9fa48("220") ? [] : (stryCov_9fa48("220"), [stryMutAct_9fa48("221") ? "" : (stryCov_9fa48("221"), 'seedream')]);
          if (stryMutAct_9fa48("224") ? false : stryMutAct_9fa48("223") ? true : stryMutAct_9fa48("222") ? validAnalysisProviders.includes(analysisProviderName) : (stryCov_9fa48("222", "223", "224"), !validAnalysisProviders.includes(analysisProviderName))) {
            if (stryMutAct_9fa48("225")) {
              {}
            } else {
              stryCov_9fa48("225");
              throw new Error(stryMutAct_9fa48("226") ? `` : (stryCov_9fa48("226"), `Invalid analysis provider: ${analysisProviderName}. Valid options: ${validAnalysisProviders.join(stryMutAct_9fa48("227") ? "" : (stryCov_9fa48("227"), ', '))}`));
            }
          }
          if (stryMutAct_9fa48("230") ? false : stryMutAct_9fa48("229") ? true : stryMutAct_9fa48("228") ? validEditingProviders.includes(editingProviderName) : (stryCov_9fa48("228", "229", "230"), !validEditingProviders.includes(editingProviderName))) {
            if (stryMutAct_9fa48("231")) {
              {}
            } else {
              stryCov_9fa48("231");
              throw new Error(stryMutAct_9fa48("232") ? `` : (stryCov_9fa48("232"), `Invalid editing provider: ${editingProviderName}. Valid options: ${validEditingProviders.join(stryMutAct_9fa48("233") ? "" : (stryCov_9fa48("233"), ', '))}`));
            }
          }

          // Fetch provider configurations based on selected providers
          const config: ProviderFactoryConfig = stryMutAct_9fa48("234") ? {} : (stryCov_9fa48("234"), {
            analysis: await this.getAnalysisProviderConfig(analysisProviderName as 'gemini'),
            editing: await this.getEditingProviderConfig(editingProviderName as 'seedream')
          });
          factory.initialize(config);
        }
      }
      return factory;
    }
  }
  private async getAnalysisProviderConfig(provider: 'gemini'): Promise<{
    provider: 'gemini';
    config: ProviderConfig;
  }> {
    if (stryMutAct_9fa48("235")) {
      {}
    } else {
      stryCov_9fa48("235");
      const [apiKey, endpoint] = await Promise.all(stryMutAct_9fa48("236") ? [] : (stryCov_9fa48("236"), [this.configService.getGeminiApiKey(), this.configService.getGeminiEndpoint()]));
      if (stryMutAct_9fa48("239") ? false : stryMutAct_9fa48("238") ? true : stryMutAct_9fa48("237") ? apiKey : (stryCov_9fa48("237", "238", "239"), !apiKey)) {
        if (stryMutAct_9fa48("240")) {
          {}
        } else {
          stryCov_9fa48("240");
          throw new Error(stryMutAct_9fa48("241") ? `` : (stryCov_9fa48("241"), `${provider} API key not configured in SSM`));
        }
      }
      return stryMutAct_9fa48("242") ? {} : (stryCov_9fa48("242"), {
        provider,
        config: {
          name: 'Gemini',
          baseUrl: endpoint || 'https://generativelanguage.googleapis.com',
          apiKey,
          timeout: 30000,
          retries: 3,
          enabled: true
        } as ProviderConfig
      });
    }
  }
  private async getEditingProviderConfig(provider: 'seedream'): Promise<{
    provider: 'seedream';
    config: ProviderConfig;
  }> {
    if (stryMutAct_9fa48("243")) {
      {}
    } else {
      stryCov_9fa48("243");
      const [apiKey, endpoint] = await Promise.all(stryMutAct_9fa48("244") ? [] : (stryCov_9fa48("244"), [this.configService.getSeedreamApiKey(), this.configService.getSeedreamEndpoint()]));
      if (stryMutAct_9fa48("247") ? false : stryMutAct_9fa48("246") ? true : stryMutAct_9fa48("245") ? apiKey : (stryCov_9fa48("245", "246", "247"), !apiKey)) {
        if (stryMutAct_9fa48("248")) {
          {}
        } else {
          stryCov_9fa48("248");
          throw new Error(stryMutAct_9fa48("249") ? `` : (stryCov_9fa48("249"), `${provider} API key not configured in SSM`));
        }
      }
      return stryMutAct_9fa48("250") ? {} : (stryCov_9fa48("250"), {
        provider,
        config: {
          name: 'Seedream',
          baseUrl: endpoint || 'https://api.seedream.com',
          apiKey,
          timeout: 60000,
          retries: 3,
          enabled: true
        } as ProviderConfig
      });
    }
  }
}