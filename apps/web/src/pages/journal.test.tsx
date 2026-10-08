import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { JournalPageDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { journalEntry, journalFixture } from '../test/fixtures';
import { server } from '../test/server';

function serveJournal(answer: (cursor: string | null) => JournalPageDto | Response) {
  const cursors: (string | null)[] = [];
  server.use(
    http.get(`${API}/children/:childId/journal`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      cursors.push(cursor);
      const body = answer(cursor);
      return body instanceof Response ? body : HttpResponse.json(body);
    }),
  );
  return cursors;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T05:00:00Z'));
  server.use(signedIn());
});
afterEach(() => vi.useRealTimers());

describe('Journal (G02)', () => {
  it('groups entries by day: meals, reactions in red, urgent events', async () => {
    serveJournal(() =>
      journalFixture({
        entries: [
          journalEntry({
            kind: 'urgent',
            id: 'u1',
            at: '2026-09-24T04:50:00.000Z',
            amount: null,
            liking: null,
            contactedMedicalAt: '2026-09-24T04:55:00.000Z',
            pausedIngredients: [{ id: 'ing_ca_hoi', name: 'Cá hồi' }],
          }),
          journalEntry({
            id: 'm1',
            reaction: { symptoms: ['rash'], severity: 'mild', note: 'Mẩn ở má' },
            pausedIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }],
          }),
          journalEntry({
            id: 'm2',
            at: '2026-09-23T11:10:00.000Z',
            date: '2026-09-23',
            slot: 'dinner',
            amount: 'all',
            liking: 5,
            dish: { id: 'custom_x', name: 'Cháo gà nhà làm', custom: true },
            actorName: null,
          }),
          journalEntry({
            kind: 'urgent',
            id: 'u0',
            at: '2026-09-20T01:00:00.000Z',
            date: null,
            slot: null,
            dish: null,
            amount: null,
            liking: null,
          }),
        ],
      }),
    );
    renderApp('/journal');
    expect(await screen.findByRole('heading', { level: 1, name: 'Nhật ký' })).toBeInTheDocument();
    const today = within(await screen.findByRole('region', { name: 'Hôm nay' }));
    expect(today.getByText('Mở “Dấu hiệu nguy hiểm”')).toBeInTheDocument();
    expect(today.getByText('Đã liên hệ y tế lúc 11:55')).toBeInTheDocument();
    expect(today.getByText('Tạm dừng: cá hồi')).toBeInTheDocument();
    expect(today.getAllByText('Trưa · Cháo cá hồi rau ngót')).toHaveLength(1);
    expect(today.getByText('Nổi mẩn đỏ · Nhẹ')).toBeInTheDocument();
    expect(today.getByText('Mẩn ở má')).toBeInTheDocument();
    expect(today.getByText('Nửa phần · thích 3/5 · bởi Mẹ Na')).toBeInTheDocument();
    expect(today.getByRole('link', { name: 'Cháo cá hồi rau ngót' })).toHaveAttribute(
      'href',
      '/dishes/dish_chao_ca_hoi_rau_ngot',
    );
    const yesterday = within(screen.getByRole('region', { name: 'Hôm qua' }));
    expect(yesterday.getByText('Hết · thích 5/5 · bởi Người dùng đã xóa')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chủ Nhật, 20 tháng 9' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).not.toBeInTheDocument();
  });

  it('loads older entries with the cursor', async () => {
    const cursors = serveJournal((cursor) =>
      cursor
        ? journalFixture({ entries: [journalEntry({ id: 'old', at: '2026-09-22T01:00:00.000Z' })] })
        : journalFixture({ nextCursor: 'next-1' }),
    );
    const user = userEvent.setup();
    renderApp('/journal');
    await user.click(await screen.findByRole('button', { name: 'Xem thêm' }));
    expect(await screen.findByRole('region', { name: 'Thứ Ba, 22 tháng 9' })).toBeInTheDocument();
    expect(cursors).toEqual([null, 'next-1']);
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).not.toBeInTheDocument();
  });

  it('loads the next page when the end of the list comes into view', async () => {
    const observed: { callback: IntersectionObserverCallback }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(public callback: IntersectionObserverCallback) {
          observed.push(this);
        }
        observe() {}
        disconnect() {}
      },
    );
    const cursors = serveJournal((cursor) =>
      cursor ? journalFixture({ entries: [] }) : journalFixture({ nextCursor: 'next-1' }),
    );
    renderApp('/journal');
    await screen.findByRole('button', { name: 'Xem thêm' });
    observed
      .at(-1)!
      .callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    expect(cursors).toEqual([null]);
    observed
      .at(-1)!
      .callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    await vi.waitFor(() => expect(cursors).toEqual([null, 'next-1']));
    vi.unstubAllGlobals();
  });

  it('says how to start when there is nothing yet', async () => {
    serveJournal(() => journalFixture({ entries: [] }));
    renderApp('/journal');
    expect(await screen.findByText(/Chưa có ghi nhận nào/)).toBeInTheDocument();
  });

  it('retries a failed first page and a failed next page', async () => {
    let first = 0;
    let next = 0;
    serveJournal((cursor) => {
      if (!cursor)
        return ++first === 1 ? problem(500, 'INTERNAL') : journalFixture({ nextCursor: 'c' });
      return ++next === 1 ? problem(500, 'INTERNAL') : journalFixture({ entries: [] });
    });
    const user = userEvent.setup();
    renderApp('/journal');
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await user.click(await screen.findByRole('button', { name: 'Xem thêm' }));
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await vi.waitFor(() => expect(next).toBe(2));
  });
});
