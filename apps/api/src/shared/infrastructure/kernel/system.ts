import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Clock } from '../../kernel/clock.port.js';
import type { IdGenerator } from '../../kernel/id-generator.port.js';

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class RandomUuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
