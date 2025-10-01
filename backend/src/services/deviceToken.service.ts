import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DeviceTokenRegistration } from '@photoeditor/shared';

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

  constructor(tableName: string, region: string) {
    this.tableName = tableName;
    this.client = new DynamoDBClient({ region });
  }

  async registerDeviceToken(
    userId: string,
    registration: DeviceTokenRegistration
  ): Promise<DeviceToken> {
    const now = new Date().toISOString();

    const deviceToken: DeviceToken = {
      userId,
      deviceId: registration.deviceId,
      expoPushToken: registration.expoPushToken,
      platform: registration.platform,
      registeredAt: now,
      updatedAt: now,
      isActive: true
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(deviceToken, { removeUndefinedValues: true }),
      // Upsert: if exists, update the token and updatedAt
      ConditionExpression: 'attribute_not_exists(userId) OR attribute_not_exists(deviceId)'
    });

    try {
      await this.client.send(command);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Device already exists, update it instead
        return this.updateDeviceToken(userId, registration);
      }
      throw error;
    }

    return deviceToken;
  }

  async updateDeviceToken(
    userId: string,
    registration: DeviceTokenRegistration
  ): Promise<DeviceToken> {
    const now = new Date().toISOString();

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ userId, deviceId: registration.deviceId }),
      UpdateExpression: 'SET #expoPushToken = :expoPushToken, #platform = :platform, #updatedAt = :updatedAt, #isActive = :isActive',
      ExpressionAttributeNames: {
        '#expoPushToken': 'expoPushToken',
        '#platform': 'platform',
        '#updatedAt': 'updatedAt',
        '#isActive': 'isActive'
      },
      ExpressionAttributeValues: marshall({
        ':expoPushToken': registration.expoPushToken,
        ':platform': registration.platform,
        ':updatedAt': now,
        ':isActive': true
      }),
      ConditionExpression: 'attribute_exists(userId)',
      ReturnValues: 'ALL_NEW'
    });

    const response = await this.client.send(command);

    if (!response.Attributes) {
      throw new Error(`Device token for user ${userId} and device ${registration.deviceId} not found`);
    }

    return unmarshall(response.Attributes) as DeviceToken;
  }

  async getDeviceToken(userId: string, deviceId: string): Promise<DeviceToken | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ userId, deviceId }),
      ConsistentRead: true
    });

    const response = await this.client.send(command);

    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item) as DeviceToken;
  }

  async getUserDeviceTokens(userId: string): Promise<DeviceToken[]> {
    // Note: This would require a GSI on userId if we need to query all devices for a user
    // For now, we'll implement this as a simple query assuming composite primary key
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ userId }),
      ConsistentRead: true
    });

    await this.client.send(command);
    // This is a simplified implementation - in reality you'd need a GSI
    // to efficiently query all devices for a user
    return [];
  }

  async deactivateDeviceToken(userId: string, deviceId: string): Promise<void> {
    const now = new Date().toISOString();

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ userId, deviceId }),
      UpdateExpression: 'SET #isActive = :isActive, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#isActive': 'isActive',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: marshall({
        ':isActive': false,
        ':updatedAt': now
      }),
      ConditionExpression: 'attribute_exists(userId)'
    });

    await this.client.send(command);
  }

  async deleteDeviceToken(userId: string, deviceId: string): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ userId, deviceId }),
      ConditionExpression: 'attribute_exists(userId)'
    });

    await this.client.send(command);
  }
}
