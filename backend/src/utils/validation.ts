import { ValidationError } from '@photoeditor/shared';
import { ZodSchema, ZodError } from 'zod';

import { AppErrorBuilder } from './errors';

export class ValidationHelper {
  static validate<T>(schema: ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof ZodError) {
        throw this.zodErrorToValidationError(error);
      }
      throw error;
    }
  }

  static validateAsync<T>(schema: ZodSchema<T>, data: unknown): Promise<T> {
    try {
      return schema.parseAsync(data);
    } catch (error) {
      if (error instanceof ZodError) {
        throw this.zodErrorToValidationError(error);
      }
      throw error;
    }
  }

  static safeValidate<T>(schema: ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: ValidationError } {
    const result = schema.safeParse(data);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      error: this.zodErrorToValidationError(result.error)
    };
  }

  private static zodErrorToValidationError(zodError: ZodError): ValidationError {
    const fieldErrors: Record<string, string[]> = {};

    zodError.errors.forEach(error => {
      const field = error.path.join('.');
      if (!fieldErrors[field]) {
        fieldErrors[field] = [];
      }
      fieldErrors[field].push(error.message);
    });

    return AppErrorBuilder.validation(
      'VALIDATION_FAILED',
      'Request validation failed',
      fieldErrors,
      { issues: zodError.errors }
    );
  }

  static validateImageFile(file: { name: string; size: number; type: string }): void {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!supportedTypes.includes(file.type)) {
      throw AppErrorBuilder.validation(
        'UNSUPPORTED_FILE_TYPE',
        `File type ${file.type} is not supported`,
        { type: [`Must be one of: ${supportedTypes.join(', ')}`] }
      );
    }

    if (file.size > maxSize) {
      throw AppErrorBuilder.validation(
        'FILE_TOO_LARGE',
        `File size ${file.size} exceeds maximum of ${maxSize} bytes`,
        { size: [`Must be less than ${Math.round(maxSize / 1024 / 1024)}MB`] }
      );
    }

    if (!file.name || file.name.trim().length === 0) {
      throw AppErrorBuilder.validation(
        'INVALID_FILE_NAME',
        'File name is required',
        { name: ['File name cannot be empty'] }
      );
    }
  }
}