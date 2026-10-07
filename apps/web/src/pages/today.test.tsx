import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { DayPlanDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import {
  LUNCH_ID,
  NA_ID,
  childFixture,
  dayFixture,
  healthFixture,
  mealFixture,
} from '../test/fixtures';
import { server } from '../test/server';

// 09:40 in Hà Nội on Thursday 24 September 2026.
const NOW = new Date('2026-09-24T02:40:00Z');

function serveDay(day: DayPlanDto | ((date: string) => DayPlanDto) = dayFixture()) {
  const requested: string[] = [];
  server.use(
    http.get(`${API}/children/:childId/days/:date`, ({ params }) => {
      expect(params.childId).toBe(NA_ID);
      const date = params.date as string;
      requested.push(date);
      return HttpResponse.json(typeof day === 'function' ? day(date) : day);
    }),
  );
  return requested;
}

const nextMeal = () => screen.findByRole('region', { name: 'Bữa tiếp theo' });
const mealList = () => screen.getByRole('region', { name: 'Thực đơn hôm nay' });

beforeEach(() => {
  // Only the clock is faked: MSW and Testing Library keep their real timeouts.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  server.use(signedIn());
});
afterEach(() => vi.useRealTimers());

describe('Today (S01)', () => {
  it('shows who and which day the plan is for, with the stage, health and avoid chips', async () => {
    serveDay();
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeInTheDocument();
    expect(screen.getByText('Thứ Năm, 24 tháng 9')).toBeInTheDocument();
    expect(screen.getByText('8 tháng 12 ngày · Giai đoạn 2')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Kết cấu: Lợn cợn' })).toHaveAttribute(
      'href',
      '/settings/age',
    );
    expect(screen.getByRole('link', { name: 'Sức khỏe: Bình thường' })).toHaveAttribute(
      'href',
      '/health',
    );
    expect(screen.getByText('Tránh: Trứng, Mướp đắng')).toBeInTheDocument();
  });

  it('leaves out the avoid chip when nothing is avoided', async () => {
    serveDay();
    server.use(
      http.get(`${API}/children`, () =>
        HttpResponse.json([childFixture({ avoidAllergens: [], avoidIngredients: [] })]),
      ),
    );
    renderApp('/');
    await nextMeal();
    expect(screen.queryByText(/^Tránh:/)).not.toBeInTheDocument();
  });

  it('presents the next meal with its countdown, groups, first-try caution and actions', async () => {
    serveDay();
    renderApp('/');
    const card = await nextMeal();
    const inCard = within(card);
    expect(inCard.getByText('Bữa tiếp theo · Trưa 11:00')).toBeInTheDocument();
    expect(inCard.getByText('còn 1 giờ 20 phút')).toBeInTheDocument();
    expect(
      inCard.getByRole('heading', { level: 2, name: 'Cháo cá hồi rau ngót' }),
    ).toBeInTheDocument();
    expect(inCard.getByText('25 phút')).toBeInTheDocument();
    expect(inCard.getByText('Lợn cợn')).toBeInTheDocument();
    expect(inCard.getByText('120–150 ml tham khảo')).toBeInTheDocument();
    for (const tag of ['Tinh bột', 'Đạm · Cá', 'Chất béo', 'Rau củ', 'Đạt 4/4 nhóm'])
      expect(inCard.getByText(tag)).toBeInTheDocument();
    expect(inCard.getByText('Lần đầu thử: rau ngót.')).toBeInTheDocument();
    expect(inCard.getByRole('link', { name: 'Đổi món' })).toHaveAttribute(
      'href',
      `/meals/${LUNCH_ID}/swap`,
    );
    expect(inCard.getByRole('link', { name: 'Bé đã ăn' })).toHaveAttribute(
      'href',
      `/meals/${LUNCH_ID}/log`,
    );
    expect(inCard.getByRole('link', { name: 'Phản ứng' })).toHaveAttribute(
      'href',
      `/meals/${LUNCH_ID}/log?reaction=1`,
    );
  });

  it.each([
    ['Bé đã ăn', 'Ghi nhận bữa ăn'],
    ['Sức khỏe: Bình thường', 'Hôm nay bé Na thế nào?'],
  ])('TC-UI-025 "%s" opens its screen, with a way back', async (link, title) => {
    serveDay();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { router } = renderApp('/');
    await nextMeal();
    await user.click(screen.getAllByRole('link', { name: link })[0]!);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('counts down every minute and says when the meal is due (TC-NXT-004)', async () => {
    serveDay();
    renderApp('/');
    const card = await nextMeal();
    act(() => vi.advanceTimersByTime(60_000));
    expect(within(card).getByText('còn 1 giờ 19 phút')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(79 * 60_000));
    expect(within(card).getByText('đã tới giờ')).toBeInTheDocument();
  });

  it('keeps an overdue meal as the next one, marked as due (TC-NXT-002)', async () => {
    vi.setSystemTime(new Date('2026-09-24T04:45:00Z'));
    serveDay();
    renderApp('/');
    expect(within(await nextMeal()).getByText('đã tới giờ')).toBeInTheDocument();
  });

  it('shows a snack without the 4-group score, protein tag or first-try caution', async () => {
    const day = dayFixture();
    serveDay({ ...day, nextMealId: day.meals[2]!.id });
    renderApp('/');
    const card = within(await nextMeal());
    expect(card.getByText('Bữa tiếp theo · Xế 15:00')).toBeInTheDocument();
    expect(card.getByText('Rau củ')).toBeInTheDocument();
    expect(card.queryByText(/Đạt \d\/4 nhóm/)).not.toBeInTheDocument();
    expect(card.queryByText(/^Đạm/)).not.toBeInTheDocument();
    expect(card.queryByText(/Lần đầu thử/)).not.toBeInTheDocument();
  });

  it('scores a main meal that misses a group honestly', async () => {
    serveDay(
      dayFixture({
        meals: [
          mealFixture({
            dish: {
              ...mealFixture().dish,
              mainProtein: null,
              foodGroups: ['carb', 'protein', 'veg'],
            },
          }),
        ],
      }),
    );
    renderApp('/');
    const card = within(await nextMeal());
    expect(card.getByText('Đạt 3/4 nhóm')).toBeInTheDocument();
    expect(card.getByText('Đạm')).toBeInTheDocument();
    expect(card.queryByText('Chất béo')).not.toBeInTheDocument();
  });

  it('lists the day in time order with each meal status, linking to the recipes', async () => {
    serveDay();
    renderApp('/');
    await nextMeal();
    const list = within(mealList());
    expect(list.getByRole('heading', { level: 2, name: 'Hôm nay' })).toBeInTheDocument();
    expect(list.getByText('3 bữa chính · 1 bữa phụ')).toBeInTheDocument();
    const rows = list.getAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual([
      '07:30SángBột yến mạch chuốiĐã ăn',
      '11:00TrưaCháo cá hồi rau ngótTiếp theo',
      '15:00XếLê hấp nghiềnBữa phụ · 10 phút',
      '18:00TốiCháo thịt gà bí đỏĐạm · Gà · 30 phút',
    ]);
    expect(rows[1]).toHaveAttribute('href', `/dishes/dish_chao_ca_hoi_rau_ngot?meal=${LUNCH_ID}`);
    expect(rows[1]).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByText('Thực đơn là gợi ý tham khảo, không thay thế tư vấn của nhân viên y tế.'),
    ).toBeInTheDocument();
  });

  it('labels refused, skipped and prepared meals', async () => {
    const day = dayFixture();
    serveDay({
      ...day,
      meals: [
        { ...day.meals[0]!, status: 'refused' },
        { ...day.meals[1]!, status: 'skipped' },
        { ...day.meals[2]!, status: 'prepared' },
        day.meals[3]!,
      ],
      nextMealId: day.meals[2]!.id,
    });
    renderApp('/');
    await nextMeal();
    const list = within(mealList());
    expect(list.getByText('Bé không ăn')).toBeInTheDocument();
    expect(list.getByText('Đã bỏ qua')).toBeInTheDocument();
    expect(list.getByText('Tiếp theo')).toBeInTheDocument();
  });

  it('shows a prepared meal that is not the next one as prepared', async () => {
    const day = dayFixture();
    serveDay({
      ...day,
      meals: [
        day.meals[0]!,
        day.meals[1]!,
        day.meals[2]!,
        { ...day.meals[3]!, status: 'prepared' },
      ],
    });
    renderApp('/');
    await nextMeal();
    expect(within(mealList()).getByText('Đã chuẩn bị')).toBeInTheDocument();
  });

  it('marks the meal prepared at once, then puts "Bé đã ăn" first (FR-025, optimistic)', async () => {
    serveDay();
    let release!: () => void;
    const bodies: unknown[] = [];
    server.use(
      http.patch(`${API}/meals/:mealId`, async ({ request, params }) => {
        bodies.push({ mealId: params.mealId, ...((await request.json()) as object) });
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ id: LUNCH_ID, status: 'prepared' });
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/');
    const card = within(await nextMeal());
    await user.click(card.getByRole('button', { name: 'Đã chuẩn bị xong' }));
    // Before the server answers.
    expect(
      await card.findByText('Đã chuẩn bị xong — cho bé ăn rồi ghi lại nhé.'),
    ).toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Đã chuẩn bị xong' })).not.toBeInTheDocument();
    expect(card.getAllByRole('link', { name: 'Bé đã ăn' })).toHaveLength(1);
    expect(card.getByRole('link', { name: 'Đổi món' })).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Phản ứng' })).toBeInTheDocument();
    await waitFor(() => expect(bodies).toEqual([{ mealId: LUNCH_ID, status: 'prepared' }]));
    release();
  });

  it('TC-UI-024 rolls back and explains when the meal was already logged elsewhere', async () => {
    let fetches = 0;
    server.use(
      http.get(`${API}/children/:childId/days/:date`, () => {
        fetches += 1;
        return HttpResponse.json(dayFixture());
      }),
      http.patch(`${API}/meals/:mealId`, () => problem(409, 'MEAL_ALREADY_LOGGED')),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/');
    const card = within(await nextMeal());
    await user.click(card.getByRole('button', { name: 'Đã chuẩn bị xong' }));
    expect(
      await screen.findByText('Bữa này đã được ghi nhận, không thể thay đổi nữa.'),
    ).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Đã chuẩn bị xong' })).toBeInTheDocument();
    // The plan is reloaded so the screen catches up with what was logged.
    await waitFor(() => expect(fetches).toBe(2));
  });

  it('sends one request for a double tap (TC-UI-016)', async () => {
    let prepared = false;
    serveDay(() => {
      const day = dayFixture();
      return prepared
        ? {
            ...day,
            meals: day.meals.map((m) =>
              m.id === LUNCH_ID ? { ...m, status: 'prepared' as const } : m,
            ),
          }
        : day;
    });
    let calls = 0;
    server.use(
      http.patch(`${API}/meals/:mealId`, () => {
        calls += 1;
        prepared = true;
        return HttpResponse.json({ id: LUNCH_ID, status: 'prepared' });
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/');
    const button = within(await nextMeal()).getByRole('button', { name: 'Đã chuẩn bị xong' });
    await user.dblClick(button);
    await screen.findByText('Đã chuẩn bị xong — cho bé ăn rồi ghi lại nhé.');
    expect(calls).toBe(1);
  });

  it('shows a finished day instead of a next meal (TC-NXT-003)', async () => {
    const day = dayFixture();
    serveDay({
      ...day,
      meals: day.meals.map((m) => ({ ...m, status: 'eaten' as const })),
      nextMealId: null,
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hôm nay đã xong' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bữa tiếp theo' })).not.toBeInTheDocument();
    expect(within(mealList()).getAllByText('Đã ăn')).toHaveLength(4);
  });

  it('TC-UI-026 keeps slots without a safe dish visible and points to the avoid list', async () => {
    const day = dayFixture();
    serveDay({
      ...day,
      meals: day.meals.filter((m) => m.slot !== 'dinner'),
      unfilledSlots: [{ slot: 'dinner', time: '18:00' }],
    });
    renderApp('/');
    await nextMeal();
    expect(screen.getByText(/Chưa tìm được món an toàn cho một số bữa/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem thực phẩm cần tránh' })).toHaveAttribute(
      'href',
      '/profile',
    );
    const list = within(mealList());
    expect(list.getByText('3 bữa chính · 1 bữa phụ')).toBeInTheDocument();
    expect(list.getByText('Chưa có món phù hợp')).toBeInTheDocument();
    // Not a link: there is no recipe to open.
    expect(list.getAllByRole('link')).toHaveLength(3);
  });

  it('shows only the alert when no slot of the day has a safe dish', async () => {
    serveDay(
      dayFixture({
        meals: [],
        nextMealId: null,
        unfilledSlots: [
          { slot: 'breakfast', time: '07:30' },
          { slot: 'lunch', time: '11:00' },
        ],
      }),
    );
    renderApp('/');
    expect(await screen.findByText(/Chưa tìm được món an toàn/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hôm nay đã xong' })).not.toBeInTheDocument();
    expect(within(mealList()).getAllByText('Chưa có món phù hợp')).toHaveLength(2);
  });

  it('TC-UI-026 does not ask for a plan for a child outside 6–24 months', async () => {
    const requested = serveDay();
    server.use(
      http.get(`${API}/children`, () =>
        HttpResponse.json([
          childFixture({
            age: { months: 4, days: 2, corrected: false },
            autoStage: null,
            effectiveStage: null,
            plannable: false,
            notPlannableReason: 'too_young',
          }),
        ]),
      ),
    );
    renderApp('/');
    expect(
      await screen.findByText('Dưới 6 tháng, ứng dụng chưa lập thực đơn ăn dặm.'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 tháng 2 ngày')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kiểm tra độ tuổi' })).toHaveAttribute(
      'href',
      '/settings/age',
    );
    expect(screen.queryByText(/^Kết cấu:/)).not.toBeInTheDocument();
    expect(requested).toEqual([]);
  });

  it('explains a child who has outgrown the app', async () => {
    server.use(
      http.get(`${API}/children`, () =>
        HttpResponse.json([
          childFixture({
            age: { months: 24, days: 1, corrected: false },
            autoStage: null,
            effectiveStage: null,
            plannable: false,
            notPlannableReason: 'too_old',
          }),
        ]),
      ),
    );
    renderApp('/');
    expect(await screen.findByText('Ứng dụng hỗ trợ bé đến 24 tháng tuổi.')).toBeInTheDocument();
  });

  it('follows the server when it says the day cannot be planned', async () => {
    serveDay(dayFixture({ plannable: false, meals: [], nextMealId: null }));
    renderApp('/');
    expect(
      await screen.findByText('Dưới 6 tháng, ứng dụng chưa lập thực đơn ăn dặm.'),
    ).toBeInTheDocument();
  });

  it('shows the stage number while the stage details are still loading', async () => {
    serveDay();
    server.use(http.get(`${API}/stages`, () => new Promise(() => {})));
    renderApp('/');
    await nextMeal();
    expect(screen.queryByText(/^Kết cấu:/)).not.toBeInTheDocument();
    expect(screen.getByText('8 tháng 12 ngày · Giai đoạn 2')).toBeInTheDocument();
  });

  it('says it is planning while the day loads, and offers a retry when it fails (TC-UI-013)', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/children/:childId/days/:date`, () => {
        attempts += 1;
        return attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(dayFixture());
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/');
    expect(await screen.findByText('Đang lập thực đơn…')).toBeInTheDocument();
    expect(await screen.findByText('Đã có lỗi xảy ra. Vui lòng thử lại.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await nextMeal()).toBeInTheDocument();
  });

  it('TC-UI-023 moves to the new day at midnight in Vietnam', async () => {
    vi.setSystemTime(new Date('2026-09-24T16:59:30Z'));
    const requested = serveDay((date) =>
      dayFixture({ date, nextMealId: date === '2026-09-24' ? null : LUNCH_ID }),
    );
    renderApp('/');
    expect(await screen.findByText('Thứ Năm, 24 tháng 9')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(await screen.findByText('Thứ Sáu, 25 tháng 9')).toBeInTheDocument();
    await nextMeal();
    expect(requested).toEqual(['2026-09-24', '2026-09-25']);
  });

  it('names the current health status on its chip', async () => {
    serveDay();
    server.use(
      http.get(`${API}/children/:childId/health`, () =>
        HttpResponse.json(healthFixture({ status: 'sick', startDate: '2026-09-24' })),
      ),
    );
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Sức khỏe: Đang ốm' })).toHaveAttribute(
      'href',
      '/health',
    );
  });

  it('TC-HLT-009 suggests updating the status once the expected end has passed', async () => {
    serveDay();
    server.use(
      http.get(`${API}/children/:childId/health`, () =>
        HttpResponse.json(
          healthFixture({
            status: 'sick',
            startDate: '2026-09-20',
            expectedEndDate: '2026-09-23',
            overdue: true,
          }),
        ),
      ),
    );
    renderApp('/');
    expect(
      await screen.findByText(
        'Đã qua ngày dự kiến khỏi (23/9). Bé đã khỏe hơn chưa? Cập nhật để thực đơn theo kịp.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cập nhật sức khỏe' })).toHaveAttribute(
      'href',
      '/health',
    );
  });
});
