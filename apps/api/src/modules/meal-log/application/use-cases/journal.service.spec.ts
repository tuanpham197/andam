import { InvalidCursorError, LogChildNotFoundError } from '../../domain/errors.js';
import type { JournalCursor, JournalEntry, JournalReader } from '../ports/out/journal.reader.js';
import { JOURNAL_PAGE_SIZE, JournalService } from './journal.service.js';

const entry = (i: number): JournalEntry => ({
  kind: 'urgent',
  id: `e-${String(i).padStart(3, '0')}`,
  at: new Date(Date.UTC(2026, 8, 24, 0, i)),
  meal: null,
  contactedMedicalAt: null,
  pausedIngredients: [],
  actorName: null,
});

class FakeJournal implements JournalReader {
  calls: { before: JournalCursor | null; limit: number }[] = [];
  constructor(private readonly entries: JournalEntry[]) {}
  async ownsChild(userId: string) {
    return userId === 'u-1';
  }
  async page(_childId: string, before: JournalCursor | null, limit: number) {
    this.calls.push({ before, limit });
    return this.entries
      .filter((e) => !before || e.at < before.at || (+e.at === +before.at && e.id < before.id))
      .sort((a, b) => +b.at - +a.at)
      .slice(0, limit);
  }
}

describe('JournalService (FR-069)', () => {
  it('pages newest first and hands back a cursor until the last page', async () => {
    const reader = new FakeJournal(Array.from({ length: 45 }, (_, i) => entry(i)));
    const journal = new JournalService(reader);
    const first = await journal.page('u-1', 'c-1');
    expect(first.entries).toHaveLength(JOURNAL_PAGE_SIZE);
    expect(first.entries[0]!.id).toBe('e-044');
    const second = await journal.page('u-1', 'c-1', first.nextCursor!);
    expect(second.entries[0]!.id).toBe('e-024');
    const third = await journal.page('u-1', 'c-1', second.nextCursor!);
    expect(third.entries.map((e) => e.id)).toEqual(['e-004', 'e-003', 'e-002', 'e-001', 'e-000']);
    expect(third.nextCursor).toBeNull();
    expect(reader.calls[0]).toEqual({ before: null, limit: JOURNAL_PAGE_SIZE + 1 });
  });

  it('has no cursor when everything fits on one page, nor for an empty journal', async () => {
    expect(
      (await new JournalService(new FakeJournal([entry(1)])).page('u-1', 'c-1')).nextCursor,
    ).toBeNull();
    expect(await new JournalService(new FakeJournal([])).page('u-1', 'c-1')).toEqual({
      entries: [],
      nextCursor: null,
    });
  });

  it.each([
    'not-base64-json',
    Buffer.from('{"a":1}').toString('base64url'),
    Buffer.from('["not a date","e-1"]').toString('base64url'),
    Buffer.from('["2026-09-24T00:00:00Z",5]').toString('base64url'),
  ])('refuses a forged cursor %s', async (cursor) => {
    await expect(
      new JournalService(new FakeJournal([])).page('u-1', 'c-1', cursor),
    ).rejects.toThrow(InvalidCursorError);
  });

  it('answers CHILD_NOT_FOUND for another family’s child', async () => {
    await expect(new JournalService(new FakeJournal([])).page('u-2', 'c-1')).rejects.toThrow(
      LogChildNotFoundError,
    );
  });
});
