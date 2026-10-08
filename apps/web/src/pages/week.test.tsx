import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { WeekPlanDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { NA_ID, childFixture, dayFixture, weekFixture } from '../test/fixtures';
import { server } from '../test/server';

// 09:40 in Hà Nội on Thursday 24 September 2026.
const NOW = new Date('2026-09-24T02:40:00Z');

function serveWeeks(answer: (weekStart: string) => WeekPlanDto = () => weekFixture()) {
  const requested: string[] = [];
  server.use(
    http.get(`${API}/children/:childId/weeks/:weekStart`, ({ params }) => {
      expect(params.childId).toBe(NA_ID);
      const weekStart = params.weekStart as string;
      requested.push(weekStart);
      return HttpResponse.json(answer(weekStart));
    }),
  );
  return requested;
}

const heading = () => screen.findByRole('heading', { level: 1, name: 'Thực đơn tuần' });
const days = () => within(screen.getByRole('navigation', { name: 'Các ngày trong tuần' }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  server.use(signedIn());
});
afterEach(() => vi.useRealTimers());

describe('Week (S04, UC-12)', () => {
  it('shows this week with the design’s indicators (FR-090..093)', async () => {
    const requested = serveWeeks();
    renderApp('/week');
    await heading();
    expect(screen.getByText('Bé Na · Tuần 21–27/9')).toBeInTheDocument();
    expect(await screen.findByText('Món khác nhau')).toBeInTheDocument();
    expect(screen.getByText('/ 28 bữa').parentElement).toHaveTextContent('19 / 28 bữa');
    expect(screen.getByText('/ 7 ngày').parentElement).toHaveTextContent('6 / 7 ngày');
    expect(requested).toEqual(['2026-09-21']);
  });

  it('TC-WK-002/003 shows the protein rotation; an avoided source reads as such', async () => {
    serveWeeks();
    renderApp('/week');
    const rotation = within(await screen.findByRole('region', { name: 'Xoay vòng nguồn đạm' }));
    expect(rotation.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Cá3',
      'Gà3',
      'Bò2',
      'Heo2',
      'Đậu2',
      'TrứngĐang tránh theo hồ sơ0',
    ]);
  });

  it('lists 7 days: groups met up to today, "kế hoạch" ahead, first tries flagged', async () => {
    serveWeeks();
    renderApp('/week');
    await screen.findByText('Món khác nhau');
    const rows = days().getAllByRole('link');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('T221/9Cháo gà cà rốt4/4');
    expect(within(rows[2]!).getByLabelText('Đạt 3/4 nhóm chất')).toHaveTextContent('3/4');
    expect(rows[3]).toHaveAttribute('aria-current', 'date');
    expect(rows[3]).toHaveTextContent('T5Hôm nay');
    expect(rows[5]).toHaveTextContent('Súp khoai lang đậu Hà Lan · đậu hà lan · mớikế hoạch');
    expect(rows[6]).toHaveAttribute('href', '/week/2026-09-27');
    expect(screen.getByText(/không phải điểm đánh giá/)).toBeInTheDocument();
  });

  it('says when a day has no plan yet (TC-WK-004)', async () => {
    serveWeeks(() =>
      weekFixture({
        days: weekFixture().days.map((d) => ({ ...d, meals: [], groupsCovered: 0 })),
      }),
    );
    renderApp('/week');
    await screen.findByText('Món khác nhau');
    expect(days().getAllByText('Chưa có thực đơn')).toHaveLength(7);
  });

  it('moves to the previous and next weeks through ?start=', async () => {
    const requested = serveWeeks((start) => weekFixture({ weekStart: start }));
    const user = userEvent.setup();
    const { router } = renderApp('/week');
    await screen.findByText('Món khác nhau');
    await user.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(await screen.findByText('Bé Na · Tuần 28/9–4/10')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?start=2026-09-28');
    await user.click(screen.getByRole('button', { name: 'Tuần trước' }));
    await user.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(await screen.findByText('Bé Na · Tuần 14–20/9')).toBeInTheDocument();
    expect(requested.slice(0, 2)).toEqual(['2026-09-21', '2026-09-28']);
    expect(requested.at(-1)).toBe('2026-09-14');
  });

  it('accepts any day of a week in ?start=, and ignores a malformed one', async () => {
    const requested = serveWeeks();
    renderApp('/week?start=2026-10-01');
    await screen.findByText('Bé Na · Tuần 28/9–4/10');
    renderApp('/week?start=soon');
    await waitFor(() => expect(requested).toEqual(['2026-09-28', '2026-09-21']));
  });

  it('offers a retry when the week cannot be loaded', async () => {
    server.use(http.get(`${API}/children/:childId/weeks/:weekStart`, () => problem(500, 'X')));
    renderApp('/week');
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    serveWeeks();
    await userEvent.setup().click(retry);
    expect(await screen.findByText('Món khác nhau')).toBeInTheDocument();
  });

  it('says there is no menu for a child outside the planning age', async () => {
    server.use(
      http.get(`${API}/children`, () =>
        HttpResponse.json([childFixture({ plannable: false, notPlannableReason: 'too_old' })]),
      ),
    );
    renderApp('/week');
    expect(await screen.findByText('Ứng dụng hỗ trợ bé đến 24 tháng tuổi.')).toBeInTheDocument();
  });
});

describe('Plan next week (G06, UC-13)', () => {
  function serveGenerate(results: ('ok' | 'exists' | 'fail')[]) {
    const calls: unknown[] = [];
    server.use(
      http.post(
        `${API}/children/:childId/weeks/:weekStart/generate`,
        async ({ params, request }) => {
          expect(params.weekStart).toBe('2026-09-28');
          calls.push(await request.json());
          const result = results[calls.length - 1];
          if (result === 'exists') return problem(409, 'PLAN_EXISTS');
          if (result === 'fail') return problem(422, 'WEEK_OUT_OF_RANGE');
          return HttpResponse.json(weekFixture({ weekStart: '2026-09-28' }));
        },
      ),
    );
    return calls;
  }

  it('plans next week in one tap and opens it', async () => {
    serveWeeks();
    const calls = serveGenerate(['ok']);
    const user = userEvent.setup();
    const { router } = renderApp('/week');
    await user.click(await screen.findByRole('button', { name: 'Lên thực đơn tuần sau' }));
    await waitFor(() => expect(router.state.location.search).toBe('?start=2026-09-28'));
    expect(calls).toEqual([{ overwrite: false }]);
  });

  it('TC-WK-005 asks before replacing an existing plan, then replaces it', async () => {
    serveWeeks();
    const calls = serveGenerate(['exists', 'ok']);
    const user = userEvent.setup();
    const { router } = renderApp('/week');
    await user.click(await screen.findByRole('button', { name: 'Lên thực đơn tuần sau' }));
    expect(await screen.findByText('Tuần sau đã có thực đơn.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thay thực đơn mới' }));
    await waitFor(() => expect(router.state.location.search).toBe('?start=2026-09-28'));
    expect(calls).toEqual([{ overwrite: false }, { overwrite: true }]);
  });

  it('can keep the existing plan and just open it', async () => {
    serveWeeks();
    const calls = serveGenerate(['exists']);
    const user = userEvent.setup();
    const { router } = renderApp('/week');
    await user.click(await screen.findByRole('button', { name: 'Lên thực đơn tuần sau' }));
    await user.click(await screen.findByRole('button', { name: 'Giữ thực đơn hiện có' }));
    await waitFor(() => expect(router.state.location.search).toBe('?start=2026-09-28'));
    expect(calls).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Lên thực đơn tuần sau' })).toBeInTheDocument();
  });

  it('shows any other refusal', async () => {
    serveWeeks();
    serveGenerate(['fail']);
    const user = userEvent.setup();
    renderApp('/week');
    await user.click(await screen.findByRole('button', { name: 'Lên thực đơn tuần sau' }));
    expect(
      await screen.findByText('Chỉ lên được thực đơn cho tuần này và tuần kế tiếp.'),
    ).toBeInTheDocument();
  });
});

describe('Day of the week (G09, FR-095)', () => {
  it('opens a day from the week with the meals of S01, and goes back to that week', async () => {
    serveWeeks();
    server.use(
      http.get(`${API}/children/:childId/days/:date`, ({ params }) =>
        HttpResponse.json(dayFixture({ date: params.date as string, nextMealId: null })),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/week');
    await screen.findByText('Món khác nhau');
    await user.click(days().getAllByRole('link')[4]!);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Thứ Sáu, 25 tháng 9' }),
    ).toBeInTheDocument();
    const list = within(await screen.findByRole('region', { name: 'Thực đơn trong ngày' }));
    expect(list.getByRole('link', { name: /Cháo cá hồi rau ngót/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/dishes/dish_chao_ca_hoi_rau_ngot?meal='),
    );
    await user.click(screen.getByRole('link', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.search).toBe('?start=2026-09-21'));
  });

  it('says when the day has nothing planned, and offers a retry on failure', async () => {
    server.use(
      http.get(`${API}/children/:childId/days/:date`, () =>
        HttpResponse.json(dayFixture({ date: '2026-09-14', meals: [], unfilledSlots: [] })),
      ),
    );
    renderApp('/week/2026-09-14');
    expect(await screen.findByText('Ngày này chưa có thực đơn.')).toBeInTheDocument();

    server.use(http.get(`${API}/children/:childId/days/:date`, () => problem(500, 'X')));
    renderApp('/week/2026-09-15');
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    server.use(
      http.get(`${API}/children/:childId/days/:date`, () =>
        HttpResponse.json(dayFixture({ date: '2026-09-15', nextMealId: null })),
      ),
    );
    await userEvent.setup().click(retry);
    expect(await screen.findByRole('region', { name: 'Thực đơn trong ngày' })).toBeInTheDocument();
  });
});
