// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { PresignController } from './presign.controller';
import { PresignService } from './presign.service';
import { DomainError, DomainErrorType } from '../../common/errors';

describe('PresignController', () => {
  let controller: PresignController;
  let service: PresignService;

  const mockPresignService = {
    generatePresignedUpload: jest.fn(),
    generateBatchPresignedUpload: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresignController],
      providers: [
        {
          provide: PresignService,
          useValue: mockPresignService,
        },
      ],
    }).compile();

    controller = module.get<PresignController>(PresignController);
    service = module.get<PresignService>(PresignService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPresignedUpload - Single Upload', () => {
    it('should generate presigned upload for valid single request', async () => {
      const request = {
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024 * 1024, // 1MB
        prompt: 'test prompt',
      };

      const expectedResponse = {
        jobId: 'job-123',
        presignedUrl: 'https://s3.example.com/upload',
        s3Key: 'uploads/user/job-123/test.jpg',
        expiresAt: new Date().toISOString(),
      };

      mockPresignService.generatePresignedUpload.mockResolvedValue(expectedResponse);

      const result = await controller.createPresignedUpload(request);

      expect(result).toEqual(expectedResponse);
      expect(service.generatePresignedUpload).toHaveBeenCalledWith(
        'anonymous',
        request
      );
    });

    it('should throw validation error for invalid single request', async () => {
      const invalidRequest = {
        fileName: '',
        contentType: 'invalid',
      };

      await expect(
        controller.createPresignedUpload(invalidRequest)
      ).rejects.toThrow(DomainError);

      await expect(
        controller.createPresignedUpload(invalidRequest)
      ).rejects.toMatchObject({
        type: DomainErrorType.VALIDATION_ERROR,
        message: 'Invalid upload request',
      });
    });
  });

  describe('createPresignedUpload - Batch Upload', () => {
    it('should generate batch presigned uploads for valid batch request', async () => {
      const request = {
        files: [
          { fileName: 'test1.jpg', contentType: 'image/jpeg', fileSize: 1024 * 1024 },
          { fileName: 'test2.jpg', contentType: 'image/jpeg', fileSize: 2 * 1024 * 1024 },
        ],
        sharedPrompt: 'batch test',
      };

      const expectedResponse = {
        batchJobId: 'batch-123',
        uploads: [
          {
            presignedUrl: 'https://s3.example.com/upload1',
            s3Key: 'uploads/user/job-1/test1.jpg',
            expiresAt: new Date().toISOString(),
          },
          {
            presignedUrl: 'https://s3.example.com/upload2',
            s3Key: 'uploads/user/job-2/test2.jpg',
            expiresAt: new Date().toISOString(),
          },
        ],
        childJobIds: ['job-1', 'job-2'],
      };

      mockPresignService.generateBatchPresignedUpload.mockResolvedValue(expectedResponse);

      const result = await controller.createPresignedUpload(request);

      expect(result).toEqual(expectedResponse);
      expect(service.generateBatchPresignedUpload).toHaveBeenCalledWith(
        'anonymous',
        request
      );
    });

    it('should throw validation error for invalid batch request', async () => {
      const invalidRequest = {
        files: [],
        sharedPrompt: '',
      };

      await expect(
        controller.createPresignedUpload(invalidRequest)
      ).rejects.toThrow(DomainError);

      await expect(
        controller.createPresignedUpload(invalidRequest)
      ).rejects.toMatchObject({
        type: DomainErrorType.VALIDATION_ERROR,
        message: 'Invalid batch upload request',
      });
    });
  });
});
