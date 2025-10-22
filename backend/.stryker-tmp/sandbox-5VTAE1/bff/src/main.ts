// @ts-nocheck
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'bff' });

/**
 * Bootstrap the NestJS application with Fastify adapter
 * @returns Configured NestFastifyApplication instance
 */
export async function bootstrap(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    {
      logger: false, // We use Powertools Logger instead
    }
  );

  // Enable CORS for local development
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors();
  }

  return app;
}

// Only listen if running locally (not in Lambda)
if (require.main === module) {
  bootstrap()
    .then(async (app) => {
      const port = process.env.PORT || 3000;
      await app.listen(port, '0.0.0.0');
      logger.info('BFF listening', { port });
    })
    .catch((error) => {
      logger.error('Failed to bootstrap BFF', { error });
      process.exit(1);
    });
}
