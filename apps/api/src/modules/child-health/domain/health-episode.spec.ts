import {
  HealthEndBeforeStartError,
  HealthStartTooFarError,
  InvalidHealthDateError,
} from './errors.js';
import { HealthEpisode } from './health-episode.js';

const TODAY = '2026-09-24';
const NOW = new Date('2026-09-24T02:00:00Z');

const start = (overrides: Partial<Parameters<typeof HealthEpisode.start>[0]> = {}) =>
  HealthEpisode.start(
    {
      id: 'h-1',
      childId: 'c-1',
      status: 'sick',
      symptoms: ['poor_appetite', 'fever'],
      startDate: TODAY,
      expectedEndDate: '2026-09-27',
      ...overrides,
    },
    TODAY,
    NOW,
  );

describe('HealthEpisode (UC-11)', () => {
  it('starts open, with symptoms in a stable order and no duplicates', () => {
    const episode = start({ symptoms: ['teething', 'fever', 'teething'] });
    expect(episode.symptoms).toEqual(['fever', 'teething']);
    expect([episode.id, episode.childId, episode.status]).toEqual(['h-1', 'c-1', 'sick']);
    expect(episode.endedAt).toBeNull();
    expect(episode.createdAt).toEqual(NOW);
  });

  it('TC-HLT-005 refuses an expected end before the start', () => {
    expect(() => start({ expectedEndDate: '2026-09-23' })).toThrow(HealthEndBeforeStartError);
  });

  it('TC-HLT-006 accepts an expected end on the start day', () => {
    expect(start({ expectedEndDate: TODAY }).expectedEndDate).toBe(TODAY);
  });

  it('TC-HLT-011 refuses a start more than 7 days ahead', () => {
    expect(start({ startDate: '2026-10-01', expectedEndDate: null }).startDate).toBe('2026-10-01');
    expect(() => start({ startDate: '2026-10-02', expectedEndDate: null })).toThrow(
      HealthStartTooFarError,
    );
  });

  it('refuses dates that do not exist', () => {
    expect(() => start({ startDate: '2026-02-30' })).toThrow(InvalidHealthDateError);
    expect(() => start({ expectedEndDate: '2026-13-01' })).toThrow(InvalidHealthDateError);
  });

  it('applies from its start to its expected end (FR-082)', () => {
    const episode = start({ startDate: '2026-09-22' });
    expect(episode.statusOn('2026-09-21')).toBe('normal');
    expect(episode.statusOn('2026-09-22')).toBe('sick');
    expect(episode.statusOn('2026-09-27')).toBe('sick');
    expect(episode.statusOn('2026-09-28')).toBe('normal');
    expect(start({ expectedEndDate: null }).statusOn('2026-12-31')).toBe('sick');
  });

  it('no longer applies once ended; ending twice keeps the first end', () => {
    const episode = start();
    episode.end(NOW);
    episode.end(new Date('2026-09-25T00:00:00Z'));
    expect(episode.endedAt).toEqual(NOW);
    expect(episode.statusOn(TODAY)).toBe('normal');
  });

  it('TC-HLT-009 is overdue once the expected end has passed while still open', () => {
    const episode = start({ expectedEndDate: '2026-09-25' });
    expect(episode.isOverdue('2026-09-25')).toBe(false);
    expect(episode.isOverdue('2026-09-26')).toBe(true);
    expect(start({ expectedEndDate: null }).isOverdue('2027-01-01')).toBe(false);
    episode.end(NOW);
    expect(episode.isOverdue('2026-09-26')).toBe(false);
  });

  it('restores a stored episode as is', () => {
    const stored = HealthEpisode.restore({
      id: 'h-2',
      childId: 'c-1',
      status: 'recovering',
      symptoms: ['cough'],
      startDate: '2026-09-20',
      expectedEndDate: null,
      endedAt: null,
      createdAt: NOW,
    });
    expect(stored.statusOn(TODAY)).toBe('recovering');
  });
});
