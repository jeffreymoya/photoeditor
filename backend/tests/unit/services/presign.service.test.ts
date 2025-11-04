import { JobStatus } from '@photoeditor/shared';
import { ok, err } from 'neverthrow';
import { PresignService } from '../../../src/services/presign.service';
import { JobService } from '../../../src/services/job.service';
import { S3Service } from '../../../src/services/s3.service';
import { JobValidationError } from '../../../src/domain/job.domain';

describe('PresignService', () => {
  let jobServiceMock: {
    createJobResult: jest.Mock;
    createBatchJobResult: jest.Mock;
    updateBatchJobStatusResult: jest.Mock;
  };
  let s3ServiceMock: {
    generatePresignedUpload: jest.Mock;
  };
  let service: PresignService;

  const baseJob = {
    jobId: 'job-001',
    userId: 'user-123',
    status: JobStatus.QUEUED,
    createdAt: '2025-10-29T00:00:00.000Z',
    updatedAt: '2025-10-29T00:00:00.000Z',
    locale: 'en',
    settings: {},
    prompt: 'prompt',
    expires_at: 0
  };

  beforeEach(() => {
    jobServiceMock = {
      createJobResult: jest.fn(),
      createBatchJobResult: jest.fn(),
      updateBatchJobStatusResult: jest.fn()
    };

    s3ServiceMock = {
      generatePresignedUpload: jest.fn()
    };

    service = new PresignService(
      jobServiceMock as unknown as JobService,
      s3ServiceMock as unknown as S3Service
    );
  });

  it('generates presigned upload for single file flow', async () => {
    const expiresAt = new Date('2025-10-29T01:00:00.000Z');
    jobServiceMock.createJobResult.mockResolvedValue(ok({
      ...baseJob,
      prompt: 'Upload prompt'
    }));
    s3ServiceMock.generatePresignedUpload.mockResolvedValue({
      url: 'https://s3.local/upload',
      fields: {
        bucket: 'temp-bucket',
        key: 'uploads/user-123/job-001/file.png',
        'Content-Type': 'image/png'
      },
      expiresAt
    });

    const response = await service.generatePresignedUpload('user-123', {
      fileName: 'file.png',
      contentType: 'image/png',
      fileSize: 1024,
      prompt: 'Upload prompt'
    });

    expect(jobServiceMock.createJobResult).toHaveBeenCalledWith({
      userId: 'user-123',
      locale: 'en',
      settings: {},
      prompt: 'Upload prompt'
    });
    expect(s3ServiceMock.generatePresignedUpload).toHaveBeenCalledWith(
      'user-123',
      'job-001',
      'file.png',
      'image/png'
    );
    expect(response).toEqual({
      jobId: 'job-001',
      presignedUrl: 'https://s3.local/upload',
      s3Key: 'uploads/user-123/job-001/file.png',
      expiresAt: expiresAt.toISOString()
    });
  });

  it('propagates errors when job creation fails', async () => {
    const error = new JobValidationError('userId is required');
    jobServiceMock.createJobResult.mockResolvedValue(err(error));

    await expect(
      service.generatePresignedUpload('user-123', {
        fileName: 'file.png',
        contentType: 'image/png',
        fileSize: 1024,
        prompt: 'Upload prompt'
      })
    ).rejects.toThrow('userId is required');

    expect(s3ServiceMock.generatePresignedUpload).not.toHaveBeenCalled();
  });

  it('generates batch presigned uploads using individual prompts when provided', async () => {
    const batchJob = {
      batchJobId: 'batch-001',
      userId: 'user-123',
      status: JobStatus.QUEUED,
      createdAt: '2025-10-29T00:00:00.000Z',
      updatedAt: '2025-10-29T00:00:00.000Z',
      sharedPrompt: 'shared',
      individualPrompts: undefined,
      childJobIds: [],
      completedCount: 0,
      totalCount: 2,
      locale: 'en',
      settings: {},
      expires_at: 0
    };

    jobServiceMock.createBatchJobResult.mockResolvedValue(ok(batchJob));
    jobServiceMock.createJobResult
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-101', prompt: 'prompt-a' }))
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-102', prompt: 'prompt-b' }));
    jobServiceMock.updateBatchJobStatusResult.mockResolvedValue(ok({ ...batchJob, childJobIds: ['job-101', 'job-102'] }));

    s3ServiceMock.generatePresignedUpload.mockImplementation(
      async (_userId: string, jobId: string, fileName: string) => ({
        url: `https://s3.local/${jobId}/${fileName}`,
        fields: {
          bucket: 'temp-bucket',
          key: `uploads/${jobId}/${fileName}`,
          'Content-Type': 'image/png'
        },
        expiresAt: new Date('2025-10-29T02:00:00.000Z')
      })
    );

    const response = await service.generateBatchPresignedUpload('user-123', {
      sharedPrompt: 'shared',
      individualPrompts: ['prompt-a', 'prompt-b'],
      files: [
        { fileName: 'a.png', contentType: 'image/png', fileSize: 2048 },
        { fileName: 'b.png', contentType: 'image/png', fileSize: 4096 }
      ]
    });

    expect(jobServiceMock.createBatchJobResult).toHaveBeenCalledWith({
      userId: 'user-123',
      sharedPrompt: 'shared',
      individualPrompts: ['prompt-a', 'prompt-b'],
      fileCount: 2,
      locale: 'en',
      settings: {}
    });
    expect(jobServiceMock.createJobResult).toHaveBeenNthCalledWith(1, {
      userId: 'user-123',
      locale: 'en',
      settings: {},
      prompt: 'prompt-a',
      batchJobId: 'batch-001'
    });
    expect(jobServiceMock.createJobResult).toHaveBeenNthCalledWith(2, {
      userId: 'user-123',
      locale: 'en',
      settings: {},
      prompt: 'prompt-b',
      batchJobId: 'batch-001'
    });
    expect(jobServiceMock.updateBatchJobStatusResult).toHaveBeenCalledWith('batch-001', JobStatus.QUEUED, {
      childJobIds: ['job-101', 'job-102']
    });
    expect(response).toEqual({
      batchJobId: 'batch-001',
      uploads: [
        {
          presignedUrl: 'https://s3.local/job-101/a.png',
          s3Key: 'uploads/job-101/a.png',
          expiresAt: new Date('2025-10-29T02:00:00.000Z').toISOString()
        },
        {
          presignedUrl: 'https://s3.local/job-102/b.png',
          s3Key: 'uploads/job-102/b.png',
          expiresAt: new Date('2025-10-29T02:00:00.000Z').toISOString()
        }
      ],
      childJobIds: ['job-101', 'job-102']
    });
  });

  it('falls back to shared prompt when individual prompt missing', async () => {
    const batchJob = {
      batchJobId: 'batch-002',
      userId: 'user-123',
      status: JobStatus.QUEUED,
      createdAt: '2025-10-29T00:00:00.000Z',
      updatedAt: '2025-10-29T00:00:00.000Z',
      sharedPrompt: 'shared',
      individualPrompts: undefined,
      childJobIds: [],
      completedCount: 0,
      totalCount: 2,
      locale: 'en',
      settings: {},
      expires_at: 0
    };

    jobServiceMock.createBatchJobResult.mockResolvedValue(ok(batchJob));
    jobServiceMock.createJobResult
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-201', prompt: 'prompt-one' }))
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-202', prompt: 'shared' }));
    jobServiceMock.updateBatchJobStatusResult.mockResolvedValue(ok({ ...batchJob, childJobIds: ['job-201', 'job-202'] }));

    s3ServiceMock.generatePresignedUpload.mockResolvedValue({
      url: 'https://s3.local/upload',
      fields: {
        bucket: 'temp-bucket',
        key: 'uploads/job-201/a.png',
        'Content-Type': 'image/png'
      },
      expiresAt: new Date('2025-10-29T02:30:00.000Z')
    });

    await service.generateBatchPresignedUpload('user-123', {
      sharedPrompt: 'shared',
      individualPrompts: ['prompt-one'],
      files: [
        { fileName: 'a.png', contentType: 'image/png', fileSize: 2048 },
        { fileName: 'b.png', contentType: 'image/png', fileSize: 4096 }
      ]
    });

    const secondCallArgs = jobServiceMock.createJobResult.mock.calls[1][0];
    expect(secondCallArgs.prompt).toBe('shared');
  });

  it('propagates errors when child job creation fails', async () => {
    const batchJob = {
      batchJobId: 'batch-err',
      userId: 'user-123',
      status: JobStatus.QUEUED,
      createdAt: '2025-10-29T00:00:00.000Z',
      updatedAt: '2025-10-29T00:00:00.000Z',
      sharedPrompt: 'shared',
      individualPrompts: undefined,
      childJobIds: [],
      completedCount: 0,
      totalCount: 2,
      locale: 'en',
      settings: {},
      expires_at: 0
    };

    const error = new JobValidationError('child job failed');
    jobServiceMock.createBatchJobResult.mockResolvedValue(ok(batchJob));
    jobServiceMock.createJobResult
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-301' }))
      .mockResolvedValueOnce(err(error));

    await expect(
      service.generateBatchPresignedUpload('user-123', {
        sharedPrompt: 'shared',
      files: [
        { fileName: 'a.png', contentType: 'image/png', fileSize: 2048 },
        { fileName: 'b.png', contentType: 'image/png', fileSize: 4096 }
      ]
    })
    ).rejects.toThrow('child job failed');

    expect(jobServiceMock.updateBatchJobStatusResult).not.toHaveBeenCalled();
    expect(s3ServiceMock.generatePresignedUpload).not.toHaveBeenCalled();
  });

  it('propagates errors when batch job update fails', async () => {
    const batchJob = {
      batchJobId: 'batch-update-err',
      userId: 'user-123',
      status: JobStatus.QUEUED,
      createdAt: '2025-10-29T00:00:00.000Z',
      updatedAt: '2025-10-29T00:00:00.000Z',
      sharedPrompt: 'shared',
      individualPrompts: undefined,
      childJobIds: [],
      completedCount: 0,
      totalCount: 2,
      locale: 'en',
      settings: {},
      expires_at: 0
    };

    const updateError = { type: 'UpdateError' as const, message: 'batch update failed' };
    jobServiceMock.createBatchJobResult.mockResolvedValue(ok(batchJob));
    jobServiceMock.createJobResult
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-401' }))
      .mockResolvedValueOnce(ok({ ...baseJob, jobId: 'job-402' }));
    jobServiceMock.updateBatchJobStatusResult.mockResolvedValue(err(updateError));

    await expect(
      service.generateBatchPresignedUpload('user-123', {
        sharedPrompt: 'shared',
        files: [
          { fileName: 'a.png', contentType: 'image/png', fileSize: 2048 },
          { fileName: 'b.png', contentType: 'image/png', fileSize: 4096 }
        ]
      })
    ).rejects.toEqual(updateError);

    expect(jobServiceMock.updateBatchJobStatusResult).toHaveBeenCalledWith('batch-update-err', JobStatus.QUEUED, {
      childJobIds: ['job-401', 'job-402']
    });
    expect(s3ServiceMock.generatePresignedUpload).not.toHaveBeenCalled();
  });
});
