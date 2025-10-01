const path = require('path');

describe('Lambda Import Validation', () => {
  const lambdaNames = ['presign', 'status', 'worker'];

  describe('Handler Import Tests', () => {
    test.each(lambdaNames)('%s lambda handler can be imported without errors', (lambdaName) => {
      const lambdaPath = path.join(__dirname, `../../../src/lambdas/${lambdaName}`);

      expect(() => {
        // This will fail if there are import/dependency issues
        require(lambdaPath);
      }).not.toThrow();
    });

    test.each(lambdaNames)('%s lambda exports handler function', (lambdaName) => {
      const lambdaPath = path.join(__dirname, `../../../src/lambdas/${lambdaName}`);

      const lambdaModule = require(lambdaPath);

      expect(lambdaModule).toHaveProperty('handler');
      expect(typeof lambdaModule.handler).toBe('function');
    });
  });

  describe('Service Dependencies Import Tests', () => {
    test('all services can be imported without errors', () => {
      const servicesPath = path.join(__dirname, '../../../src/services');

      expect(() => {
        require(path.join(servicesPath, 'index'));
      }).not.toThrow();
    });

    test('individual services export expected classes', () => {
      const servicesPath = path.join(__dirname, '../../../src/services');
      const services = require(path.join(servicesPath, 'index'));

      const expectedServices = [
        'JobService',
        'PresignService',
        'S3Service',
        'ConfigService',
        'BootstrapService'
      ];

      expectedServices.forEach(serviceName => {
        expect(services).toHaveProperty(serviceName);
        expect(typeof services[serviceName]).toBe('function'); // Constructor function
      });
    });
  });

  describe('Shared Module Import Tests', () => {
    test('shared schemas can be imported', () => {
      expect(() => {
        require('@photoeditor/shared');
      }).not.toThrow();
    });

    test('shared schemas export expected validation schemas', () => {
      const shared = require('@photoeditor/shared');

      const expectedSchemas = [
        'PresignUploadRequestSchema',
        'BatchUploadRequestSchema'
      ];

      expectedSchemas.forEach(schemaName => {
        expect(shared).toHaveProperty(schemaName);
        expect(shared[schemaName]).toHaveProperty('parse'); // Zod schema
      });
    });
  });

  describe('Environment Variable Dependencies', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test('lambdas handle missing environment variables gracefully', () => {
      // Clear environment variables that lambdas expect
      delete process.env.AWS_REGION;
      delete process.env.PROJECT_NAME;
      delete process.env.NODE_ENV;
      delete process.env.TEMP_BUCKET_NAME;
      delete process.env.FINAL_BUCKET_NAME;
      delete process.env.JOBS_TABLE_NAME;

      lambdaNames.forEach(lambdaName => {
        const lambdaPath = path.join(__dirname, `../../../src/lambdas/${lambdaName}`);

        // Should be able to import even without env vars
        expect(() => {
          require(lambdaPath);
        }).not.toThrow();
      });
    });
  });

  describe('Critical Dependencies Validation', () => {
    test('zod is available and functional', () => {
      const zod = require('zod');

      expect(zod).toBeDefined();
      expect(typeof zod.z).toBe('object');

      // Test basic zod functionality
      const testSchema = zod.z.object({
        test: zod.z.string()
      });

      expect(() => {
        testSchema.parse({ test: 'value' });
      }).not.toThrow();
    });

    test('uuid is available and functional', () => {
      const { v4: uuidv4 } = require('uuid');

      expect(uuidv4).toBeDefined();
      expect(typeof uuidv4).toBe('function');

      const uuid = uuidv4();
      expect(typeof uuid).toBe('string');
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('AWS SDK modules are available', () => {
      const awsModules = [
        '@aws-sdk/client-dynamodb',
        '@aws-sdk/client-s3',
        '@aws-sdk/client-sns',
        '@aws-sdk/client-ssm',
        '@aws-sdk/s3-request-presigner',
        '@aws-sdk/util-dynamodb'
      ];

      awsModules.forEach(moduleName => {
        expect(() => {
          require(moduleName);
        }).not.toThrow();
      });
    });
  });
});