import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './openapi/openapi-document.js';
import { ENV } from './shared/infrastructure/config/config.module.js';
import type { Env } from './shared/infrastructure/config/env.js';
import { AppExpressAdapter } from './shared/infrastructure/http/app-express.adapter.js';
import { ProblemDetailsFilter } from './shared/infrastructure/http/problem-details.filter.js';

export const API_PREFIX = 'api/v1';

/** Applies every cross-cutting HTTP concern; shared by the real app and the e2e test apps. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useBodyParser('json', { limit: '100kb' });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter(new NestLogger('ProblemDetailsFilter')));
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app));
  }
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new AppExpressAdapter(), {
    bufferLogs: true,
  });
  configureApp(app);
  return app;
}

export async function bootstrap(): Promise<NestExpressApplication> {
  const app = await createApp();
  await app.listen(app.get<Env>(ENV).PORT);
  return app;
}
