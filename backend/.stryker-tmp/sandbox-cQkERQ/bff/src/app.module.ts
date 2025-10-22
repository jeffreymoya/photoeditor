import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { PresignModule } from './modules/presign/presign.module';
import { JobModule } from './modules/job/job.module';
import { LoggingInterceptor } from './observability';
import { DomainErrorFilter } from './common/errors';

/**
 * Root application module for NestJS BFF
 * Wires feature modules and global providers (interceptors, filters)
 * Implements layering per STANDARDS.md line 24
 */
@Module({
  imports: [
    PresignModule,
    JobModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: DomainErrorFilter,
    },
  ],
})
export class AppModule {}
