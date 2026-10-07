import { Global, Module } from '@nestjs/common';
import { validateEnv } from './env.js';

export const ENV = Symbol('ENV');

// Validated once per application instance (not at import time), so each test app sees the
// process.env it was created with.
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => validateEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
