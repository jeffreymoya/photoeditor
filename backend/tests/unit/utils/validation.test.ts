/**
 * Unit tests for ValidationHelper
 * Tests Zod schema validation helpers and image file validation
 */

import { z } from 'zod';
import { ValidationHelper } from '../../../src/utils/validation';
import { ValidationError } from '@photoeditor/shared';

describe('ValidationHelper', () => {
  describe('validate', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number().positive(),
      email: z.string().email()
    });

    it('should return validated data for valid input', () => {
      const data = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };

      const result = ValidationHelper.validate(testSchema, data);

      expect(result).toEqual(data);
    });

    it('should throw ValidationError for invalid input', () => {
      const data = {
        name: 'John',
        age: -5,
        email: 'invalid-email'
      };

      expect(() => ValidationHelper.validate(testSchema, data)).toThrow();
    });

    it('should convert ZodError to ValidationError with field errors', () => {
      const data = {
        name: 123, // Invalid: should be string
        age: 'not-a-number', // Invalid: should be number
        email: 'invalid'
      };

      try {
        ValidationHelper.validate(testSchema, data);
        fail('Should have thrown an error');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('VALIDATION_FAILED');
        expect(validationError.message).toBe('Request validation failed');
        expect(validationError.fieldErrors).toBeDefined();
      }
    });

    it('should handle missing required fields', () => {
      const data = {
        name: 'John'
        // Missing age and email
      };

      expect(() => ValidationHelper.validate(testSchema, data)).toThrow();
    });

    it('should handle nested object validation', () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string(),
          profile: z.object({
            bio: z.string()
          })
        })
      });

      const validData = {
        user: {
          name: 'John',
          profile: {
            bio: 'Developer'
          }
        }
      };

      const result = ValidationHelper.validate(nestedSchema, validData);
      expect(result).toEqual(validData);
    });

    it('should handle array validation', () => {
      const arraySchema = z.object({
        tags: z.array(z.string())
      });

      const data = {
        tags: ['typescript', 'testing', 'jest']
      };

      const result = ValidationHelper.validate(arraySchema, data);
      expect(result).toEqual(data);
    });

    it('should throw for non-ZodError errors', () => {
      const errorSchema = z.string().refine(() => {
        throw new Error('Custom error');
      });

      expect(() => ValidationHelper.validate(errorSchema, 'test')).toThrow('Custom error');
    });
  });

  describe('validateAsync', () => {
    const asyncSchema = z.object({
      email: z.string().email(),
      username: z.string().min(3)
    });

    it('should return validated data for valid input', async () => {
      const data = {
        email: 'user@example.com',
        username: 'john'
      };

      const result = await ValidationHelper.validateAsync(asyncSchema, data);

      expect(result).toEqual(data);
    });

    it('should throw ValidationError for invalid input', async () => {
      const data = {
        email: 'invalid-email',
        username: 'ab' // Too short
      };

      await expect(ValidationHelper.validateAsync(asyncSchema, data)).rejects.toThrow();
    });

    it('should handle async refinements', async () => {
      const refinedSchema = z.object({
        value: z.string().refine(async val => val.length > 0, {
          message: 'Value cannot be empty'
        })
      });

      const validData = { value: 'test' };
      const result = await ValidationHelper.validateAsync(refinedSchema, validData);
      expect(result).toEqual(validData);
    });
  });

  describe('safeValidate', () => {
    const safeSchema = z.object({
      id: z.string().uuid(),
      count: z.number().int().positive()
    });

    it('should return success result for valid input', () => {
      const data = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        count: 5
      };

      const result = ValidationHelper.safeValidate(safeSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });

    it('should return error result for invalid input', () => {
      const data = {
        id: 'not-a-uuid',
        count: -1
      };

      const result = ValidationHelper.safeValidate(safeSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.fieldErrors).toBeDefined();
      }
    });

    it('should include field errors in error result', () => {
      const data = {
        id: 'invalid',
        count: 0
      };

      const result = ValidationHelper.safeValidate(safeSchema, data);

      if (!result.success) {
        expect(result.error.fieldErrors?.id).toBeDefined();
        expect(result.error.fieldErrors?.count).toBeDefined();
      }
    });

    it('should not throw for invalid input', () => {
      const data = { invalid: 'data' };

      expect(() => ValidationHelper.safeValidate(safeSchema, data)).not.toThrow();
    });

    it('should handle partial data', () => {
      const data = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const result = ValidationHelper.safeValidate(safeSchema, data);

      expect(result.success).toBe(false);
    });

    it('should handle extra fields based on schema', () => {
      const strictSchema = z.object({
        name: z.string()
      }).strict();

      const data = {
        name: 'John',
        extra: 'field'
      };

      const result = ValidationHelper.safeValidate(strictSchema, data);

      expect(result.success).toBe(false);
    });
  });

  describe('validateImageFile', () => {
    it('should validate JPEG files', () => {
      const file = {
        name: 'photo.jpg',
        size: 1024 * 1024, // 1MB
        type: 'image/jpeg'
      };

      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });

    it('should validate PNG files', () => {
      const file = {
        name: 'photo.png',
        size: 1024 * 1024,
        type: 'image/png'
      };

      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });

    it('should validate HEIC files', () => {
      const file = {
        name: 'photo.heic',
        size: 1024 * 1024,
        type: 'image/heic'
      };

      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });

    it('should validate WebP files', () => {
      const file = {
        name: 'photo.webp',
        size: 1024 * 1024,
        type: 'image/webp'
      };

      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });

    it('should reject unsupported file types', () => {
      const file = {
        name: 'document.pdf',
        size: 1024 * 1024,
        type: 'application/pdf'
      };

      expect(() => ValidationHelper.validateImageFile(file)).toThrow();

      try {
        ValidationHelper.validateImageFile(file);
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('UNSUPPORTED_FILE_TYPE');
        expect(validationError.message).toContain('application/pdf');
      }
    });

    it('should reject GIF files', () => {
      const file = {
        name: 'animation.gif',
        size: 1024 * 1024,
        type: 'image/gif'
      };

      expect(() => ValidationHelper.validateImageFile(file)).toThrow();
    });

    it('should reject files larger than 50MB', () => {
      const file = {
        name: 'large.jpg',
        size: 51 * 1024 * 1024, // 51MB
        type: 'image/jpeg'
      };

      expect(() => ValidationHelper.validateImageFile(file)).toThrow();

      try {
        ValidationHelper.validateImageFile(file);
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('FILE_TOO_LARGE');
        expect(validationError.message).toContain('exceeds maximum');
      }
    });

    it('should accept files at exactly 50MB', () => {
      const file = {
        name: 'max-size.jpg',
        size: 50 * 1024 * 1024, // Exactly 50MB
        type: 'image/jpeg'
      };

      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });

    it('should reject files with empty names', () => {
      const file = {
        name: '',
        size: 1024 * 1024,
        type: 'image/jpeg'
      };

      expect(() => ValidationHelper.validateImageFile(file)).toThrow();

      try {
        ValidationHelper.validateImageFile(file);
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('INVALID_FILE_NAME');
        expect(validationError.message).toBe('File name is required');
      }
    });

    it('should reject files with whitespace-only names', () => {
      const file = {
        name: '   ',
        size: 1024 * 1024,
        type: 'image/jpeg'
      };

      expect(() => ValidationHelper.validateImageFile(file)).toThrow();

      try {
        ValidationHelper.validateImageFile(file);
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('INVALID_FILE_NAME');
      }
    });

    it('should accept files with valid name, type, and size', () => {
      const file = {
        name: 'valid-photo.png',
        size: 10 * 1024 * 1024, // 10MB
        type: 'image/png'
      };

      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });

    it('should handle zero-byte files', () => {
      const file = {
        name: 'empty.jpg',
        size: 0,
        type: 'image/jpeg'
      };

      // Zero-byte files should pass validation (size check is only for max)
      expect(() => ValidationHelper.validateImageFile(file)).not.toThrow();
    });
  });

  describe('zodErrorToValidationError', () => {
    it('should group multiple errors for the same field', () => {
      const schema = z.object({
        password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/)
      });

      const data = { password: 'short' };

      try {
        ValidationHelper.validate(schema, data);
        fail('Should have thrown an error');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.fieldErrors?.password).toBeDefined();
        expect(validationError.fieldErrors?.password.length).toBeGreaterThan(0);
      }
    });

    it('should handle nested field paths', () => {
      const schema = z.object({
        user: z.object({
          address: z.object({
            zip: z.string().regex(/^\d{5}$/)
          })
        })
      });

      const data = {
        user: {
          address: {
            zip: 'invalid'
          }
        }
      };

      try {
        ValidationHelper.validate(schema, data);
        fail('Should have thrown an error');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.fieldErrors).toBeDefined();
        expect(Object.keys(validationError.fieldErrors!)).toContain('user.address.zip');
      }
    });

    it('should include details with original Zod issues', () => {
      const schema = z.object({
        value: z.string()
      });

      const data = { value: 123 };

      try {
        ValidationHelper.validate(schema, data);
        fail('Should have thrown an error');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.details).toBeDefined();
        expect(validationError.details?.issues).toBeDefined();
      }
    });
  });
});
