import { Inject, Injectable } from '@nestjs/common';
import { InvalidCursorError, LogChildNotFoundError } from '../../domain/errors.js';
import {
  JOURNAL_READER,
  type JournalCursor,
  type JournalEntry,
  type JournalReader,
} from '../ports/out/journal.reader.js';

export const JOURNAL_PAGE_SIZE = 20;

export interface JournalPage {
  entries: JournalEntry[];
  /** Opaque; pass it back as `cursor` for older entries. Null on the last page. */
  nextCursor: string | null;
}

const encode = (entry: JournalEntry) =>
  Buffer.from(JSON.stringify([entry.at.toISOString(), entry.id])).toString('base64url');

function decode(cursor: string): JournalCursor {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [string, string];
    const date = new Date(at);
    if (typeof id !== 'string' || Number.isNaN(date.getTime())) throw new Error('bad cursor');
    return { at: date, id };
  } catch {
    throw new InvalidCursorError();
  }
}

/** FR-069 / G02: meals, reactions and urgent events, newest first, page by page. */
@Injectable()
export class JournalService {
  constructor(@Inject(JOURNAL_READER) private readonly journal: JournalReader) {}

  async page(userId: string, childId: string, cursor?: string): Promise<JournalPage> {
    if (!(await this.journal.ownsChild(userId, childId))) throw new LogChildNotFoundError();
    const before = cursor ? decode(cursor) : null;
    const rows = await this.journal.page(childId, before, JOURNAL_PAGE_SIZE + 1);
    const entries = rows.slice(0, JOURNAL_PAGE_SIZE);
    return {
      entries,
      nextCursor: rows.length > JOURNAL_PAGE_SIZE ? encode(entries.at(-1)!) : null,
    };
  }
}
