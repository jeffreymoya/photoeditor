// @ts-nocheck
const path = require('path');

describe('Lambda Import Smoke Tests', () => {
  const lambdaNames = ['presign', 'status', 'worker'];

  // Keep one smoke import test per lambda as recommended
  describe('Handler Import Tests', () => {
    test.each(lambdaNames)('%s lambda exports handler function', (lambdaName) => {
      const lambdaPath = path.join(__dirname, `../../../src/lambdas/${lambdaName}`);

      const lambdaModule = require(lambdaPath);

      expect(lambdaModule).toHaveProperty('handler');
      expect(typeof lambdaModule.handler).toBe('function');
    });
  });

  describe('Service Dependencies Import Tests', () => {
    test('services export expected classes', () => {
      const servicesPath = path.join(__dirname, '../../../src/services');
      const services = require(path.join(servicesPath, 'index'));

      // ConfigService and BootstrapService moved to @backend/core
      const expectedServices = [
        'JobService',
        'PresignService',
        'S3Service',
        'DeviceTokenService',
        'NotificationService'
      ];

      expectedServices.forEach(serviceName => {
        expect(services).toHaveProperty(serviceName);
        expect(typeof services[serviceName]).toBe('function');
      });
    });

    test('core library exports expected modules', () => {
      const core = require('../../../libs/core');

      const expectedExports = [
        'ConfigService',
        'BootstrapService',
        'createS3Client',
        'createDynamoDBClient',
        'createSSMClient',
        'StandardProviderCreator'
      ];

      expectedExports.forEach(exportName => {
        expect(core).toHaveProperty(exportName);
      });
    });
  });

  describe('Shared Module Import Tests', () => {
    test('shared schemas export expected validation schemas', () => {
      const shared = require('@photoeditor/shared');

      const expectedSchemas = [
        'PresignUploadRequestSchema',
        'BatchUploadRequestSchema'
      ];

      expectedSchemas.forEach(schemaName => {
        expect(shared).toHaveProperty(schemaName);
        expect(shared[schemaName]).toHaveProperty('parse');
      });
    });
  });
});