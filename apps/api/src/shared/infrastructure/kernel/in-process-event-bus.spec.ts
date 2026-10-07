import type { DomainEvent } from '../../kernel/event-bus.port.js';
import { InProcessEventBus } from './in-process-event-bus.js';

describe('InProcessEventBus', () => {
  it('awaits every handler of the event type, in subscription order', async () => {
    const bus = new InProcessEventBus();
    const calls: string[] = [];
    bus.subscribe('ProfileChanged', async (event) => {
      await new Promise((r) => setTimeout(r, 5));
      calls.push(`a:${(event as DomainEvent & { childId: string }).childId}`);
    });
    bus.subscribe('ProfileChanged', async () => {
      calls.push('b');
    });
    bus.subscribe('Other', async () => {
      calls.push('other');
    });
    await bus.publish({ type: 'ProfileChanged', childId: 'c-1' });
    expect(calls).toEqual(['a:c-1', 'b']);
  });

  it('does nothing for an event nobody listens to', async () => {
    await expect(new InProcessEventBus().publish({ type: 'Nobody' })).resolves.toBeUndefined();
  });

  it('lets a failing handler fail the publisher (the change must not be half-applied silently)', async () => {
    const bus = new InProcessEventBus();
    bus.subscribe('ProfileChanged', async () => {
      throw new Error('regeneration failed');
    });
    await expect(bus.publish({ type: 'ProfileChanged' })).rejects.toThrow('regeneration failed');
  });
});
