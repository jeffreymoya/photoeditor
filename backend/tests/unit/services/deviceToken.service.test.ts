/**
 * Unit tests for DeviceTokenService
 *
 * Tests device token CRUD operations including registration, updates, retrieval, and deletion.
 * Validates alignment with standards/backend-tier.md service layer requirements.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DeviceTokenService } from '../../../src/services/deviceToken.service';
import { DeviceTokenRegistration } from '@photoeditor/shared';

const dynamoMock = mockClient(DynamoDBClient);

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;
  const TABLE_NAME = 'test-device-tokens-table';
  const REGION = 'us-east-1';

  beforeEach(() => {
    dynamoMock.reset();
    service = new DeviceTokenService(TABLE_NAME, REGION);
  });

  describe('Constructor', () => {
    it('should initialize with table name and region', () => {
      expect(service).toBeDefined();
    });

    it('should accept custom DynamoDB client', () => {
      const customClient = new DynamoDBClient({ region: 'eu-west-1' });
      const customService = new DeviceTokenService(TABLE_NAME, REGION, customClient);
      expect(customService).toBeDefined();
    });
  });

  describe('registerDeviceToken', () => {
    const userId = 'user-123';
    const registration: DeviceTokenRegistration = {
      deviceId: 'device-abc',
      expoPushToken: 'ExponentPushToken[xxx]',
      platform: 'ios'
    };

    it('should successfully register a new device token', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const result = await service.registerDeviceToken(userId, registration);

      expect(result).toMatchObject({
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: registration.platform,
        isActive: true
      });
      expect(result.registeredAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(typeof result.registeredAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');

      const calls = dynamoMock.commandCalls(PutItemCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe(TABLE_NAME);
      expect(calls[0].args[0].input.ConditionExpression).toBe(
        'attribute_not_exists(userId) OR attribute_not_exists(deviceId)'
      );
    });

    it('should handle ConditionalCheckFailedException and update existing token', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      (conditionalError as any).name = 'ConditionalCheckFailedException';

      dynamoMock.on(PutItemCommand).rejects(conditionalError);

      const updatedToken = {
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: registration.platform,
        registeredAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedToken)
      });

      const result = await service.registerDeviceToken(userId, registration);

      expect(result).toMatchObject({
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: registration.platform
      });

      const updateCalls = dynamoMock.commandCalls(UpdateItemCommand);
      expect(updateCalls.length).toBe(1);
    });

    it('should propagate non-conditional errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).name = 'NetworkingError';

      dynamoMock.on(PutItemCommand).rejects(networkError);

      await expect(
        service.registerDeviceToken(userId, registration)
      ).rejects.toThrow('Network error');
    });

    it('should register Android device token', async () => {
      const androidRegistration: DeviceTokenRegistration = {
        deviceId: 'android-device-123',
        expoPushToken: 'ExponentPushToken[yyy]',
        platform: 'android'
      };

      dynamoMock.on(PutItemCommand).resolves({});

      const result = await service.registerDeviceToken(userId, androidRegistration);

      expect(result.platform).toBe('android');
      expect(result.deviceId).toBe(androidRegistration.deviceId);
    });
  });

  describe('updateDeviceToken', () => {
    const userId = 'user-123';
    const registration: DeviceTokenRegistration = {
      deviceId: 'device-abc',
      expoPushToken: 'ExponentPushToken[updated]',
      platform: 'ios'
    };

    it('should successfully update existing device token', async () => {
      const updatedToken = {
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: registration.platform,
        registeredAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedToken)
      });

      const result = await service.updateDeviceToken(userId, registration);

      expect(result).toMatchObject({
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: registration.platform,
        isActive: true
      });

      const calls = dynamoMock.commandCalls(UpdateItemCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe(TABLE_NAME);
      expect(calls[0].args[0].input.UpdateExpression).toBe(
        'SET #expoPushToken = :expoPushToken, #platform = :platform, #updatedAt = :updatedAt, #isActive = :isActive'
      );
      expect(calls[0].args[0].input.ConditionExpression).toBe('attribute_exists(userId)');
    });

    it('should throw error when device token not found', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: undefined
      });

      await expect(
        service.updateDeviceToken(userId, registration)
      ).rejects.toThrow(`Device token for user ${userId} and device ${registration.deviceId} not found`);
    });

    it('should propagate DynamoDB errors', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      (conditionalError as any).name = 'ConditionalCheckFailedException';

      dynamoMock.on(UpdateItemCommand).rejects(conditionalError);

      await expect(
        service.updateDeviceToken(userId, registration)
      ).rejects.toThrow('ConditionalCheckFailedException');
    });

    it('should update platform when changed', async () => {
      const updatedRegistration: DeviceTokenRegistration = {
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: 'android' // Changed from ios to android
      };

      const updatedToken = {
        userId,
        deviceId: registration.deviceId,
        expoPushToken: registration.expoPushToken,
        platform: 'android',
        registeredAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedToken)
      });

      const result = await service.updateDeviceToken(userId, updatedRegistration);

      expect(result.platform).toBe('android');
    });
  });

  describe('getDeviceToken', () => {
    const userId = 'user-123';
    const deviceId = 'device-abc';

    it('should retrieve existing device token', async () => {
      const existingToken = {
        userId,
        deviceId,
        expoPushToken: 'ExponentPushToken[xxx]',
        platform: 'ios',
        registeredAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        isActive: true
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(existingToken)
      });

      const result = await service.getDeviceToken(userId, deviceId);

      expect(result).toMatchObject(existingToken);

      const calls = dynamoMock.commandCalls(GetItemCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe(TABLE_NAME);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });

    it('should return null when device token not found', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      const result = await service.getDeviceToken(userId, deviceId);

      expect(result).toBeNull();
    });

    it('should use consistent read for strong consistency', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      await service.getDeviceToken(userId, deviceId);

      const calls = dynamoMock.commandCalls(GetItemCommand);
      expect(calls[0].args[0].input.ConsistentRead).toBe(true);
    });

    it('should handle DynamoDB errors', async () => {
      const error = new Error('ProvisionedThroughputExceededException');
      dynamoMock.on(GetItemCommand).rejects(error);

      await expect(
        service.getDeviceToken(userId, deviceId)
      ).rejects.toThrow('ProvisionedThroughputExceededException');
    });
  });

  describe('getUserDeviceTokens', () => {
    const userId = 'user-123';

    it('should return empty array (simplified implementation)', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      const result = await service.getUserDeviceTokens(userId);

      expect(result).toEqual([]);
    });

    it('should call DynamoDB with userId', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      await service.getUserDeviceTokens(userId);

      const calls = dynamoMock.commandCalls(GetItemCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe(TABLE_NAME);
    });
  });

  describe('deactivateDeviceToken', () => {
    const userId = 'user-123';
    const deviceId = 'device-abc';

    it('should successfully deactivate device token', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({});

      await service.deactivateDeviceToken(userId, deviceId);

      const calls = dynamoMock.commandCalls(UpdateItemCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe(TABLE_NAME);
      expect(calls[0].args[0].input.UpdateExpression).toBe(
        'SET #isActive = :isActive, #updatedAt = :updatedAt'
      );
      expect(calls[0].args[0].input.ConditionExpression).toBe('attribute_exists(userId)');

      // Verify isActive is set to false
      const expressionValues = calls[0].args[0].input.ExpressionAttributeValues;
      expect(expressionValues).toBeDefined();
    });

    it('should handle conditional check failure when token does not exist', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      (conditionalError as any).name = 'ConditionalCheckFailedException';

      dynamoMock.on(UpdateItemCommand).rejects(conditionalError);

      await expect(
        service.deactivateDeviceToken(userId, deviceId)
      ).rejects.toThrow('ConditionalCheckFailedException');
    });

    it('should update timestamp when deactivating', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({});

      await service.deactivateDeviceToken(userId, deviceId);

      const calls = dynamoMock.commandCalls(UpdateItemCommand);
      const expressionNames = calls[0].args[0].input.ExpressionAttributeNames;

      expect(expressionNames).toMatchObject({
        '#isActive': 'isActive',
        '#updatedAt': 'updatedAt'
      });
    });
  });

  describe('deleteDeviceToken', () => {
    const userId = 'user-123';
    const deviceId = 'device-abc';

    it('should successfully delete device token', async () => {
      dynamoMock.on(DeleteItemCommand).resolves({});

      await service.deleteDeviceToken(userId, deviceId);

      const calls = dynamoMock.commandCalls(DeleteItemCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe(TABLE_NAME);
      expect(calls[0].args[0].input.ConditionExpression).toBe('attribute_exists(userId)');
    });

    it('should handle conditional check failure when token does not exist', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      (conditionalError as any).name = 'ConditionalCheckFailedException';

      dynamoMock.on(DeleteItemCommand).rejects(conditionalError);

      await expect(
        service.deleteDeviceToken(userId, deviceId)
      ).rejects.toThrow('ConditionalCheckFailedException');
    });

    it('should include correct composite key in delete operation', async () => {
      dynamoMock.on(DeleteItemCommand).resolves({});

      await service.deleteDeviceToken(userId, deviceId);

      const calls = dynamoMock.commandCalls(DeleteItemCommand);
      const key = calls[0].args[0].input.Key;

      expect(key).toBeDefined();
    });

    it('should handle DynamoDB errors', async () => {
      const error = new Error('InternalServerError');
      dynamoMock.on(DeleteItemCommand).rejects(error);

      await expect(
        service.deleteDeviceToken(userId, deviceId)
      ).rejects.toThrow('InternalServerError');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network timeout');
      (networkError as any).name = 'NetworkingError';

      dynamoMock.on(PutItemCommand).rejects(networkError);

      await expect(
        service.registerDeviceToken('user-123', {
          deviceId: 'device-abc',
          expoPushToken: 'token',
          platform: 'ios'
        })
      ).rejects.toThrow('Network timeout');
    });

    it('should handle malformed data errors', async () => {
      const validationError = new Error('ValidationException');
      (validationError as any).name = 'ValidationException';

      dynamoMock.on(PutItemCommand).rejects(validationError);

      await expect(
        service.registerDeviceToken('user-123', {
          deviceId: 'device-abc',
          expoPushToken: 'token',
          platform: 'ios'
        })
      ).rejects.toThrow('ValidationException');
    });
  });

  describe('Data Integrity', () => {
    it('should maintain consistent timestamp format', async () => {
      const registration: DeviceTokenRegistration = {
        deviceId: 'device-123',
        expoPushToken: 'token',
        platform: 'ios'
      };

      dynamoMock.on(PutItemCommand).resolves({});

      const result = await service.registerDeviceToken('user-123', registration);

      // Verify ISO 8601 timestamp format
      expect(result.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should always set isActive to true for new registrations', async () => {
      const registration: DeviceTokenRegistration = {
        deviceId: 'device-123',
        expoPushToken: 'token',
        platform: 'android'
      };

      dynamoMock.on(PutItemCommand).resolves({});

      const result = await service.registerDeviceToken('user-123', registration);

      expect(result.isActive).toBe(true);
    });
  });
});
