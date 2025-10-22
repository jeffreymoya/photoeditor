import { HttpStatus } from '@nestjs/common';
import {
  DomainError,
  DomainErrorType,
  mapErrorToHttpStatus,
  mapJobStatusToError,
} from './error-taxonomy';

describe('Error Taxonomy', () => {
  describe('DomainError', () => {
    it('should create domain error with all fields', () => {
      const error = new DomainError(
        DomainErrorType.VALIDATION_ERROR,
        'Test error',
        { field: 'test' },
        new Error('cause')
      );

      expect(error.type).toBe(DomainErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Test error');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.name).toBe('DomainError');
    });

    it('should serialize to JSON', () => {
      const error = new DomainError(
        DomainErrorType.RESOURCE_NOT_FOUND,
        'Not found',
        { id: '123' }
      );

      const json = error.toJSON();

      expect(json).toEqual({
        type: DomainErrorType.RESOURCE_NOT_FOUND,
        message: 'Not found',
        details: { id: '123' },
      });
    });
  });

  describe('mapErrorToHttpStatus', () => {
    it('should map VALIDATION_ERROR to BAD_REQUEST', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.VALIDATION_ERROR)).toBe(
        HttpStatus.BAD_REQUEST
      );
    });

    it('should map RESOURCE_NOT_FOUND to NOT_FOUND', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.RESOURCE_NOT_FOUND)).toBe(
        HttpStatus.NOT_FOUND
      );
    });

    it('should map UNAUTHORIZED to UNAUTHORIZED', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.UNAUTHORIZED)).toBe(
        HttpStatus.UNAUTHORIZED
      );
    });

    it('should map FORBIDDEN to FORBIDDEN', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.FORBIDDEN)).toBe(
        HttpStatus.FORBIDDEN
      );
    });

    it('should map CONFLICT to CONFLICT', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.CONFLICT)).toBe(
        HttpStatus.CONFLICT
      );
    });

    it('should map PRECONDITION_FAILED to PRECONDITION_FAILED', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.PRECONDITION_FAILED)).toBe(
        HttpStatus.PRECONDITION_FAILED
      );
    });

    it('should map INTERNAL_ERROR to INTERNAL_SERVER_ERROR', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.INTERNAL_ERROR)).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    });

    it('should map SERVICE_UNAVAILABLE to SERVICE_UNAVAILABLE', () => {
      expect(mapErrorToHttpStatus(DomainErrorType.SERVICE_UNAVAILABLE)).toBe(
        HttpStatus.SERVICE_UNAVAILABLE
      );
    });
  });

  describe('mapJobStatusToError', () => {
    it('should map QUEUED to PRECONDITION_FAILED', () => {
      expect(mapJobStatusToError('QUEUED')).toBe(
        DomainErrorType.PRECONDITION_FAILED
      );
    });

    it('should map PROCESSING to PRECONDITION_FAILED', () => {
      expect(mapJobStatusToError('PROCESSING')).toBe(
        DomainErrorType.PRECONDITION_FAILED
      );
    });

    it('should map EDITING to PRECONDITION_FAILED', () => {
      expect(mapJobStatusToError('EDITING')).toBe(
        DomainErrorType.PRECONDITION_FAILED
      );
    });

    it('should map FAILED to INTERNAL_ERROR', () => {
      expect(mapJobStatusToError('FAILED')).toBe(
        DomainErrorType.INTERNAL_ERROR
      );
    });

    it('should map unknown status to INTERNAL_ERROR', () => {
      expect(mapJobStatusToError('UNKNOWN')).toBe(
        DomainErrorType.INTERNAL_ERROR
      );
    });
  });
});
