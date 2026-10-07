import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { AppExpressAdapter } from '../../src/shared/infrastructure/http/app-express.adapter.js';

export interface TestAppOptions {
  controllers?: Type[];
  /** Replace a provider by token, e.g. the mailer with a recording fake. */
  overrides?: [token: unknown, value: unknown][];
  /** Temporary environment for this app only (restored after the app is built). */
  env?: Record<string, string>;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  const previous = Object.fromEntries(
    Object.keys(options.env ?? {}).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, options.env);
  try {
    const builder = Test.createTestingModule({
      imports: [AppModule],
      controllers: options.controllers ?? [],
    });
    for (const [token, value] of options.overrides ?? []) {
      builder.overrideProvider(token).useValue(value);
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>(new AppExpressAdapter(), {
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    return app;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
