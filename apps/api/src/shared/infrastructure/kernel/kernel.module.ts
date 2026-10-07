import { Global, Module } from '@nestjs/common';
import { CLOCK } from '../../kernel/clock.port.js';
import { EVENT_BUS } from '../../kernel/event-bus.port.js';
import { ID_GENERATOR } from '../../kernel/id-generator.port.js';
import { InProcessEventBus } from './in-process-event-bus.js';
import { RandomUuidGenerator, SystemClock } from './system.js';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: RandomUuidGenerator },
    { provide: EVENT_BUS, useClass: InProcessEventBus },
  ],
  exports: [CLOCK, ID_GENERATOR, EVENT_BUS],
})
export class KernelModule {}
