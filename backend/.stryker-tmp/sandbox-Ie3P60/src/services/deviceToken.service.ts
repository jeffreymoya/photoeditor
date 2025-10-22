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
import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DeviceTokenRegistration } from '@photoeditor/shared';
import { createDynamoDBClient } from '@backend/core';
export interface DeviceToken {
  userId: string;
  deviceId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
  registeredAt: string;
  updatedAt: string;
  isActive: boolean;
}
export class DeviceTokenService {
  private client: DynamoDBClient;
  private tableName: string;
  constructor(tableName: string, region: string, client?: DynamoDBClient) {
    if (stryMutAct_9fa48("297")) {
      {}
    } else {
      stryCov_9fa48("297");
      this.tableName = tableName;
      // Use provided client or create one via factory (STANDARDS.md line 32)
      this.client = stryMutAct_9fa48("300") ? client && createDynamoDBClient(region) : stryMutAct_9fa48("299") ? false : stryMutAct_9fa48("298") ? true : (stryCov_9fa48("298", "299", "300"), client || createDynamoDBClient(region));
    }
  }
  async registerDeviceToken(userId: string, registration: DeviceTokenRegistration): Promise<DeviceToken> {
    if (stryMutAct_9fa48("301")) {
      {}
    } else {
      stryCov_9fa48("301");
      const now = new Date().toISOString();
      const deviceToken: DeviceToken = stryMutAct_9fa48("302") ? {} : (stryCov_9fa48("302"), {
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: registration.platform,
        registeredAt: now,
        updatedAt: now,
        isActive: stryMutAct_9fa48("303") ? false : (stryCov_9fa48("303"), true)
      });
      const command = new PutItemCommand(stryMutAct_9fa48("304") ? {} : (stryCov_9fa48("304"), {
        TableName: this.tableName,
        Item: marshall(deviceToken, stryMutAct_9fa48("305") ? {} : (stryCov_9fa48("305"), {
          removeUndefinedValues: stryMutAct_9fa48("306") ? false : (stryCov_9fa48("306"), true)
        })),
        // Upsert: if exists, update the token and updatedAt
        ConditionExpression: stryMutAct_9fa48("307") ? "" : (stryCov_9fa48("307"), 'attribute_not_exists(userId) OR attribute_not_exists(deviceId)')
      }));
      try {
        if (stryMutAct_9fa48("308")) {
          {}
        } else {
          stryCov_9fa48("308");
          await this.client.send(command);
        }
      } catch (error: unknown) {
        if (stryMutAct_9fa48("309")) {
          {}
        } else {
          stryCov_9fa48("309");
          if (stryMutAct_9fa48("312") ? (error as {
            name: string;
          }).name !== 'ConditionalCheckFailedException' : stryMutAct_9fa48("311") ? false : stryMutAct_9fa48("310") ? true : (stryCov_9fa48("310", "311", "312"), (error as {
            name: string;
          }).name === (stryMutAct_9fa48("313") ? "" : (stryCov_9fa48("313"), 'ConditionalCheckFailedException')))) {
            if (stryMutAct_9fa48("314")) {
              {}
            } else {
              stryCov_9fa48("314");
              // Device already exists, update it instead
              return this.updateDeviceToken(userId, registration);
            }
          }
          throw error;
        }
      }
      return deviceToken;
    }
  }
  async updateDeviceToken(userId: string, registration: DeviceTokenRegistration): Promise<DeviceToken> {
    if (stryMutAct_9fa48("315")) {
      {}
    } else {
      stryCov_9fa48("315");
      const now = new Date().toISOString();
      const command = new UpdateItemCommand(stryMutAct_9fa48("316") ? {} : (stryCov_9fa48("316"), {
        TableName: this.tableName,
        Key: marshall(stryMutAct_9fa48("317") ? {} : (stryCov_9fa48("317"), {
          userId,
          deviceId: registration.deviceId
        })),
        UpdateExpression: stryMutAct_9fa48("318") ? "" : (stryCov_9fa48("318"), 'SET #expoPushToken = :expoPushToken, #platform = :platform, #updatedAt = :updatedAt, #isActive = :isActive'),
        ExpressionAttributeNames: stryMutAct_9fa48("319") ? {} : (stryCov_9fa48("319"), {
          '#expoPushToken': stryMutAct_9fa48("320") ? "" : (stryCov_9fa48("320"), 'expoPushToken'),
          '#platform': stryMutAct_9fa48("321") ? "" : (stryCov_9fa48("321"), 'platform'),
          '#updatedAt': stryMutAct_9fa48("322") ? "" : (stryCov_9fa48("322"), 'updatedAt'),
          '#isActive': stryMutAct_9fa48("323") ? "" : (stryCov_9fa48("323"), 'isActive')
        }),
        ExpressionAttributeValues: marshall(stryMutAct_9fa48("324") ? {} : (stryCov_9fa48("324"), {
          ':expoPushToken': registration.expoPushToken,
          ':platform': registration.platform,
          ':updatedAt': now,
          ':isActive': stryMutAct_9fa48("325") ? false : (stryCov_9fa48("325"), true)
        })),
        ConditionExpression: stryMutAct_9fa48("326") ? "" : (stryCov_9fa48("326"), 'attribute_exists(userId)'),
        ReturnValues: stryMutAct_9fa48("327") ? "" : (stryCov_9fa48("327"), 'ALL_NEW')
      }));
      const response = await this.client.send(command);
      if (stryMutAct_9fa48("330") ? false : stryMutAct_9fa48("329") ? true : stryMutAct_9fa48("328") ? response.Attributes : (stryCov_9fa48("328", "329", "330"), !response.Attributes)) {
        if (stryMutAct_9fa48("331")) {
          {}
        } else {
          stryCov_9fa48("331");
          throw new Error(stryMutAct_9fa48("332") ? `` : (stryCov_9fa48("332"), `Device token for user ${userId} and device ${registration.deviceId} not found`));
        }
      }
      return unmarshall(response.Attributes) as DeviceToken;
    }
  }
  async getDeviceToken(userId: string, deviceId: string): Promise<DeviceToken | null> {
    if (stryMutAct_9fa48("333")) {
      {}
    } else {
      stryCov_9fa48("333");
      const command = new GetItemCommand(stryMutAct_9fa48("334") ? {} : (stryCov_9fa48("334"), {
        TableName: this.tableName,
        Key: marshall(stryMutAct_9fa48("335") ? {} : (stryCov_9fa48("335"), {
          userId,
          deviceId
        })),
        ConsistentRead: stryMutAct_9fa48("336") ? false : (stryCov_9fa48("336"), true)
      }));
      const response = await this.client.send(command);
      if (stryMutAct_9fa48("339") ? false : stryMutAct_9fa48("338") ? true : stryMutAct_9fa48("337") ? response.Item : (stryCov_9fa48("337", "338", "339"), !response.Item)) {
        if (stryMutAct_9fa48("340")) {
          {}
        } else {
          stryCov_9fa48("340");
          return null;
        }
      }
      return unmarshall(response.Item) as DeviceToken;
    }
  }
  async getUserDeviceTokens(userId: string): Promise<DeviceToken[]> {
    if (stryMutAct_9fa48("341")) {
      {}
    } else {
      stryCov_9fa48("341");
      // Note: This would require a GSI on userId if we need to query all devices for a user
      // For now, we'll implement this as a simple query assuming composite primary key
      const command = new GetItemCommand(stryMutAct_9fa48("342") ? {} : (stryCov_9fa48("342"), {
        TableName: this.tableName,
        Key: marshall(stryMutAct_9fa48("343") ? {} : (stryCov_9fa48("343"), {
          userId
        })),
        ConsistentRead: stryMutAct_9fa48("344") ? false : (stryCov_9fa48("344"), true)
      }));
      await this.client.send(command);
      // This is a simplified implementation - in reality you'd need a GSI
      // to efficiently query all devices for a user
      return stryMutAct_9fa48("345") ? ["Stryker was here"] : (stryCov_9fa48("345"), []);
    }
  }
  async deactivateDeviceToken(userId: string, deviceId: string): Promise<void> {
    if (stryMutAct_9fa48("346")) {
      {}
    } else {
      stryCov_9fa48("346");
      const now = new Date().toISOString();
      const command = new UpdateItemCommand(stryMutAct_9fa48("347") ? {} : (stryCov_9fa48("347"), {
        TableName: this.tableName,
        Key: marshall(stryMutAct_9fa48("348") ? {} : (stryCov_9fa48("348"), {
          userId,
          deviceId
        })),
        UpdateExpression: stryMutAct_9fa48("349") ? "" : (stryCov_9fa48("349"), 'SET #isActive = :isActive, #updatedAt = :updatedAt'),
        ExpressionAttributeNames: stryMutAct_9fa48("350") ? {} : (stryCov_9fa48("350"), {
          '#isActive': stryMutAct_9fa48("351") ? "" : (stryCov_9fa48("351"), 'isActive'),
          '#updatedAt': stryMutAct_9fa48("352") ? "" : (stryCov_9fa48("352"), 'updatedAt')
        }),
        ExpressionAttributeValues: marshall(stryMutAct_9fa48("353") ? {} : (stryCov_9fa48("353"), {
          ':isActive': stryMutAct_9fa48("354") ? true : (stryCov_9fa48("354"), false),
          ':updatedAt': now
        })),
        ConditionExpression: stryMutAct_9fa48("355") ? "" : (stryCov_9fa48("355"), 'attribute_exists(userId)')
      }));
      await this.client.send(command);
    }
  }
  async deleteDeviceToken(userId: string, deviceId: string): Promise<void> {
    if (stryMutAct_9fa48("356")) {
      {}
    } else {
      stryCov_9fa48("356");
      const command = new DeleteItemCommand(stryMutAct_9fa48("357") ? {} : (stryCov_9fa48("357"), {
        TableName: this.tableName,
        Key: marshall(stryMutAct_9fa48("358") ? {} : (stryCov_9fa48("358"), {
          userId,
          deviceId
        })),
        ConditionExpression: stryMutAct_9fa48("359") ? "" : (stryCov_9fa48("359"), 'attribute_exists(userId)')
      }));
      await this.client.send(command);
    }
  }
}