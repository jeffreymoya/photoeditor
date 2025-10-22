import { Test, TestingModule } from '@nestjs/testing';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { DomainError, DomainErrorType } from '../../common/errors';
import { JobStatus } from '@photoeditor/shared';

describe('JobController', () => {
  let controller: JobController;
  let service: JobService;

  const mockJobService = {
    getJobStatus: jest.fn(),
    getDownloadUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobController],
      providers: [
        {
          provide: JobService,
          useValue: mockJobService,
        },
      ],
    }).compile();

    controller = module.get<JobController>(JobController);
    service = module.get<JobService>(JobService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return job status for valid jobId', async () => {
      const jobId = 'job-123';
      const expectedJob = {
        jobId,
        userId: 'user-123',
        status: JobStatus.COMPLETED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locale: 'en',
        settings: {},
        expires_at: Math.floor(Date.now() / 1000) + 86400,
      };

      mockJobService.getJobStatus.mockResolvedValue(expectedJob);

      const result = await controller.getStatus(jobId);

      expect(result).toEqual(expectedJob);
      expect(service.getJobStatus).toHaveBeenCalledWith(jobId);
    });

    it('should throw validation error for empty jobId', async () => {
      await expect(controller.getStatus('')).rejects.toThrow(DomainError);

      await expect(controller.getStatus('')).rejects.toMatchObject({
        type: DomainErrorType.VALIDATION_ERROR,
        message: 'Job ID required',
      });
    });

    it('should propagate service errors', async () => {
      const error = new DomainError(
        DomainErrorType.RESOURCE_NOT_FOUND,
        'Job not found'
      );

      mockJobService.getJobStatus.mockRejectedValue(error);

      await expect(controller.getStatus('job-123')).rejects.toThrow(error);
    });
  });

  describe('getDownload', () => {
    it('should return download URL for completed job', async () => {
      const jobId = 'job-123';
      const expectedResponse = {
        downloadUrl: 'https://s3.example.com/download',
        expiresAt: new Date().toISOString(),
        jobId,
        status: JobStatus.COMPLETED,
      };

      mockJobService.getDownloadUrl.mockResolvedValue(expectedResponse);

      const result = await controller.getDownload(jobId);

      expect(result).toEqual(expectedResponse);
      expect(service.getDownloadUrl).toHaveBeenCalledWith(jobId);
    });

    it('should throw validation error for empty jobId', async () => {
      await expect(controller.getDownload('')).rejects.toThrow(DomainError);

      await expect(controller.getDownload('')).rejects.toMatchObject({
        type: DomainErrorType.VALIDATION_ERROR,
        message: 'Job ID required',
      });
    });

    it('should propagate service errors', async () => {
      const error = new DomainError(
        DomainErrorType.PRECONDITION_FAILED,
        'Job not completed'
      );

      mockJobService.getDownloadUrl.mockRejectedValue(error);

      await expect(controller.getDownload('job-123')).rejects.toThrow(error);
    });
  });
});
