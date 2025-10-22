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
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
export class ConfigService {
  private ssmClient: SSMClient;
  private projectName: string;
  private environment: string;
  constructor(region: string, projectName: string, environment: string) {
    if (stryMutAct_9fa48("251")) {
      {}
    } else {
      stryCov_9fa48("251");
      this.ssmClient = new SSMClient(stryMutAct_9fa48("252") ? {} : (stryCov_9fa48("252"), {
        region
      }));
      this.projectName = projectName;
      this.environment = environment;
    }
  }
  private getParameterName(key: string): string {
    if (stryMutAct_9fa48("253")) {
      {}
    } else {
      stryCov_9fa48("253");
      return stryMutAct_9fa48("254") ? `` : (stryCov_9fa48("254"), `/${this.projectName}-${this.environment}/${key}`);
    }
  }
  async getParameter(key: string, withDecryption: boolean = stryMutAct_9fa48("255") ? true : (stryCov_9fa48("255"), false)): Promise<string | null> {
    if (stryMutAct_9fa48("256")) {
      {}
    } else {
      stryCov_9fa48("256");
      try {
        if (stryMutAct_9fa48("257")) {
          {}
        } else {
          stryCov_9fa48("257");
          const command = new GetParameterCommand(stryMutAct_9fa48("258") ? {} : (stryCov_9fa48("258"), {
            Name: this.getParameterName(key),
            WithDecryption: withDecryption
          }));
          const response = await this.ssmClient.send(command);
          return stryMutAct_9fa48("261") ? response.Parameter?.Value && null : stryMutAct_9fa48("260") ? false : stryMutAct_9fa48("259") ? true : (stryCov_9fa48("259", "260", "261"), (stryMutAct_9fa48("262") ? response.Parameter.Value : (stryCov_9fa48("262"), response.Parameter?.Value)) || null);
        }
      } catch (error) {
        if (stryMutAct_9fa48("263")) {
          {}
        } else {
          stryCov_9fa48("263");
          if (stryMutAct_9fa48("266") ? (error as {
            name: string;
          }).name !== 'ParameterNotFound' : stryMutAct_9fa48("265") ? false : stryMutAct_9fa48("264") ? true : (stryCov_9fa48("264", "265", "266"), (error as {
            name: string;
          }).name === (stryMutAct_9fa48("267") ? "" : (stryCov_9fa48("267"), 'ParameterNotFound')))) {
            if (stryMutAct_9fa48("268")) {
              {}
            } else {
              stryCov_9fa48("268");
              return null;
            }
          }
          throw error;
        }
      }
    }
  }
  async isStubProvidersEnabled(): Promise<boolean> {
    if (stryMutAct_9fa48("269")) {
      {}
    } else {
      stryCov_9fa48("269");
      const value = await this.getParameter(stryMutAct_9fa48("270") ? "" : (stryCov_9fa48("270"), 'providers/enable-stubs'));
      return stryMutAct_9fa48("273") ? value !== 'true' : stryMutAct_9fa48("272") ? false : stryMutAct_9fa48("271") ? true : (stryCov_9fa48("271", "272", "273"), value === (stryMutAct_9fa48("274") ? "" : (stryCov_9fa48("274"), 'true')));
    }
  }
  async getGeminiApiKey(): Promise<string | null> {
    if (stryMutAct_9fa48("275")) {
      {}
    } else {
      stryCov_9fa48("275");
      return this.getParameter(stryMutAct_9fa48("276") ? "" : (stryCov_9fa48("276"), 'gemini/api-key'), stryMutAct_9fa48("277") ? false : (stryCov_9fa48("277"), true));
    }
  }
  async getSeedreamApiKey(): Promise<string | null> {
    if (stryMutAct_9fa48("278")) {
      {}
    } else {
      stryCov_9fa48("278");
      return this.getParameter(stryMutAct_9fa48("279") ? "" : (stryCov_9fa48("279"), 'seedream/api-key'), stryMutAct_9fa48("280") ? false : (stryCov_9fa48("280"), true));
    }
  }
  async getGeminiEndpoint(): Promise<string | null> {
    if (stryMutAct_9fa48("281")) {
      {}
    } else {
      stryCov_9fa48("281");
      return this.getParameter(stryMutAct_9fa48("282") ? "" : (stryCov_9fa48("282"), 'gemini/endpoint'));
    }
  }
  async getSeedreamEndpoint(): Promise<string | null> {
    if (stryMutAct_9fa48("283")) {
      {}
    } else {
      stryCov_9fa48("283");
      return this.getParameter(stryMutAct_9fa48("284") ? "" : (stryCov_9fa48("284"), 'seedream/endpoint'));
    }
  }
  async getAnalysisProviderName(): Promise<string> {
    if (stryMutAct_9fa48("285")) {
      {}
    } else {
      stryCov_9fa48("285");
      const providerName = await this.getParameter(stryMutAct_9fa48("286") ? "" : (stryCov_9fa48("286"), 'providers/analysis'));
      return stryMutAct_9fa48("289") ? providerName && 'gemini' : stryMutAct_9fa48("288") ? false : stryMutAct_9fa48("287") ? true : (stryCov_9fa48("287", "288", "289"), providerName || (stryMutAct_9fa48("290") ? "" : (stryCov_9fa48("290"), 'gemini'))); // Default to 'gemini' if not set
    }
  }
  async getEditingProviderName(): Promise<string> {
    if (stryMutAct_9fa48("291")) {
      {}
    } else {
      stryCov_9fa48("291");
      const providerName = await this.getParameter(stryMutAct_9fa48("292") ? "" : (stryCov_9fa48("292"), 'providers/editing'));
      return stryMutAct_9fa48("295") ? providerName && 'seedream' : stryMutAct_9fa48("294") ? false : stryMutAct_9fa48("293") ? true : (stryCov_9fa48("293", "294", "295"), providerName || (stryMutAct_9fa48("296") ? "" : (stryCov_9fa48("296"), 'seedream'))); // Default to 'seedream' if not set
    }
  }
}