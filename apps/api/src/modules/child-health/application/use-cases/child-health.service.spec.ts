import {
  HEALTH_CHILD,
  HEALTH_USER,
  childHealthTestbed,
} from '../../../../../test/fakes/child-health.js';
import { HealthChildNotFoundError, HealthEndBeforeStartError } from '../../domain/errors.js';

const sick = {
  status: 'sick' as const,
  symptoms: ['fever' as const],
  startDate: '2026-09-24',
  expectedEndDate: '2026-09-26',
};

describe('ChildHealthService (UC-11, FR-080..084)', () => {
  it('reads "Bình thường" when no episode is open', async () => {
    const t = childHealthTestbed();
    expect(await t.service.current(HEALTH_USER, HEALTH_CHILD)).toEqual({
      status: 'normal',
      symptoms: [],
      startDate: null,
      expectedEndDate: null,
      overdue: false,
    });
  });

  it('starts an episode, announces it and returns it', async () => {
    const t = childHealthTestbed();
    const view = await t.service.update(HEALTH_USER, HEALTH_CHILD, sick);
    expect(view).toEqual({ ...sick, overdue: false });
    expect(t.events.published).toEqual([
      { type: 'HealthChanged', childId: HEALTH_CHILD, userId: HEALTH_USER },
    ]);
    expect(await t.service.current(HEALTH_USER, HEALTH_CHILD)).toEqual(view);
  });

  it('starts today when no start date is given', async () => {
    const t = childHealthTestbed();
    const view = await t.service.update(HEALTH_USER, HEALTH_CHILD, {
      status: 'recovering',
      symptoms: [],
    });
    expect(view).toMatchObject({
      status: 'recovering',
      startDate: '2026-09-24',
      expectedEndDate: null,
    });
  });

  it('TC-HLT-008 sick → recovering → normal ends each episode before the next', async () => {
    const t = childHealthTestbed();
    await t.service.update(HEALTH_USER, HEALTH_CHILD, sick);
    await t.service.update(HEALTH_USER, HEALTH_CHILD, { status: 'recovering', symptoms: [] });
    expect(t.episodes.rows.filter((e) => e.endedAt === null).map((e) => e.status)).toEqual([
      'recovering',
    ]);
    const normal = await t.service.update(HEALTH_USER, HEALTH_CHILD, {
      status: 'normal',
      symptoms: [],
    });
    expect(normal.status).toBe('normal');
    expect(t.episodes.rows.every((e) => e.endedAt !== null)).toBe(true);
    expect(t.events.published).toHaveLength(3);
  });

  it('TC-HLT-007 drops symptoms sent with "Bình thường", and stays quiet when nothing changes', async () => {
    const t = childHealthTestbed();
    const view = await t.service.update(HEALTH_USER, HEALTH_CHILD, {
      status: 'normal',
      symptoms: ['fever'],
    });
    expect(view.symptoms).toEqual([]);
    expect(t.episodes.rows).toEqual([]);
    expect(t.events.published).toEqual([]);
  });

  it('TC-HLT-009 flags an episode past its expected end', async () => {
    const t = childHealthTestbed();
    await t.service.update(HEALTH_USER, HEALTH_CHILD, sick);
    t.clock.set('2026-09-27T02:00:00Z');
    expect((await t.service.current(HEALTH_USER, HEALTH_CHILD)).overdue).toBe(true);
  });

  it('rejects invalid dates before writing anything', async () => {
    const t = childHealthTestbed();
    await expect(
      t.service.update(HEALTH_USER, HEALTH_CHILD, { ...sick, expectedEndDate: '2026-09-20' }),
    ).rejects.toThrow(HealthEndBeforeStartError);
    expect(t.uow.runs).toBe(0);
  });

  it('rolls the episode back when re-planning the menu fails', async () => {
    const t = childHealthTestbed();
    t.events.subscribe('HealthChanged', async () => {
      throw new Error('planning failed');
    });
    await expect(t.service.update(HEALTH_USER, HEALTH_CHILD, sick)).rejects.toThrow(
      'planning failed',
    );
    expect(t.episodes.rows).toEqual([]);
  });

  it('hides another user’s child', async () => {
    const t = childHealthTestbed();
    await expect(t.service.current('u-2', HEALTH_CHILD)).rejects.toThrow(HealthChildNotFoundError);
    await expect(t.service.update('u-2', HEALTH_CHILD, sick)).rejects.toThrow(
      HealthChildNotFoundError,
    );
  });

  it('tells other modules the status on a date', async () => {
    const t = childHealthTestbed();
    expect(await t.queries.statusOn(HEALTH_CHILD, '2026-09-24')).toBe('normal');
    await t.service.update(HEALTH_USER, HEALTH_CHILD, sick);
    expect(await t.queries.statusOn(HEALTH_CHILD, '2026-09-25')).toBe('sick');
    expect(await t.queries.statusOn(HEALTH_CHILD, '2026-09-27')).toBe('normal');
  });
});
