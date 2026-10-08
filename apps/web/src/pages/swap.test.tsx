import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { SwapSuggestionsDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { LUNCH_ID, mealFixture, swapFixture } from '../test/fixtures';
import { server } from '../test/server';

const SWAP_URL = `/meals/${LUNCH_ID}/swap`;

/** Serves suggestions per reason and records which reasons were asked for. */
function serveSuggestions(
  answer: (reason: string) => SwapSuggestionsDto | Promise<SwapSuggestionsDto> = (reason) =>
    swapFixture({ reason: reason as SwapSuggestionsDto['reason'] }),
) {
  const reasons: string[] = [];
  server.use(
    http.get(`${API}/meals/:mealId/swap-suggestions`, ({ params, request }) => {
      expect(params.mealId).toBe(LUNCH_ID);
      const reason = new URL(request.url).searchParams.get('reason')!;
      reasons.push(reason);
      return Promise.resolve(answer(reason)).then((body) => HttpResponse.json(body));
    }),
  );
  return reasons;
}

beforeEach(() => server.use(signedIn()));

describe('Swap (S02)', () => {
  it('shows the meal being replaced and asks why, "Thiếu nguyên liệu" first', async () => {
    const reasons = serveSuggestions();
    renderApp(SWAP_URL);
    expect(await screen.findByRole('heading', { level: 1, name: 'Đổi món khác' })).toBeVisible();
    expect(await screen.findByText('Bữa trưa · 11:00')).toBeInTheDocument();
    expect(screen.getByText('Đang thay: Cháo cá hồi rau ngót')).toBeInTheDocument();
    const why = within(screen.getByRole('group', { name: 'Vì sao muốn đổi?' }));
    expect(why.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Thiếu nguyên liệu',
      'Bé không thích',
      'Cần nấu nhanh hơn',
      'Lý do khác',
    ]);
    expect(why.getByRole('button', { name: 'Thiếu nguyên liệu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(reasons).toEqual(['missing_ingredient']);
  });

  it('presents the best fit with its reasons, then the others (FR-041/042)', async () => {
    serveSuggestions(() => swapFixture({ otherMains: [{ slot: 'dinner', protein: 'chicken' }] }));
    renderApp(SWAP_URL);
    const best = within(await screen.findByRole('article', { name: 'Cháo thịt bò cải bó xôi' }));
    expect(best.getByText('Phù hợp nhất')).toBeInTheDocument();
    expect(best.getByText('20 phút · Lợn cợn · 120–150 ml')).toBeInTheDocument();
    expect(best.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Chưa dùng trong 7 ngày qua',
      'Đạm bò — khác nguồn đạm bữa tối (gà)',
      'Bé từng ăn hết hoặc rất thích món này',
    ]);
    expect(best.getByRole('button', { name: 'Chọn món này' })).toBeEnabled();

    const soup = within(screen.getByRole('article', { name: 'Súp khoai lang đậu Hà Lan' }));
    expect(soup.getByText('15 phút · Đạm · Đậu · Nhanh hơn 10 phút')).toBeInTheDocument();
    expect(soup.getByRole('button', { name: 'Chọn Súp khoai lang đậu Hà Lan' })).toBeEnabled();

    const fish = within(screen.getByRole('article', { name: 'Cháo cá lóc bí xanh' }));
    expect(fish.getByText('25 phút · Đạm · Cá')).toBeInTheDocument();
    expect(
      fish.getByText(
        'Đã dùng 4 ngày trước — hệ thống nới cửa sổ chống lặp từ 7 xuống 3 ngày vì kho món còn ít.',
      ),
    ).toBeInTheDocument();
  });

  it('says how many dishes the safety filter removed, and that it is never relaxed (FR-043)', async () => {
    serveSuggestions();
    renderApp(SWAP_URL);
    expect(
      await screen.findByText(
        'Đã loại 6 món: 3 chứa trứng (cần tránh), 2 chưa hợp độ tuổi, 1 bé từng từ chối. Bộ lọc an toàn không bao giờ được nới.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves the summary out when nothing was removed', async () => {
    serveSuggestions(() =>
      swapFixture({
        excluded: {
          total: 0,
          byReason: { allergen: 0, avoid: 0, paused: 0, age: 0, refused: 0, sick_new: 0 },
        },
      }),
    );
    renderApp(SWAP_URL);
    await screen.findByRole('article', { name: 'Cháo thịt bò cải bó xôi' });
    expect(screen.queryByText(/Đã loại/)).not.toBeInTheDocument();
  });

  it('re-ranks when the reason changes, keeping the list while it loads (UC-06 1a)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const reasons = serveSuggestions((reason) =>
      reason === 'faster'
        ? gate.then(() => swapFixture({ reason: 'faster', ranked: [swapFixture().ranked[1]!] }))
        : swapFixture(),
    );
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    await screen.findByRole('article', { name: 'Cháo thịt bò cải bó xôi' });
    await user.click(screen.getByRole('button', { name: 'Cần nấu nhanh hơn' }));
    expect(screen.getByRole('button', { name: 'Cần nấu nhanh hơn' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByText('Đang cập nhật…')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Cháo thịt bò cải bó xôi' })).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: 'Cháo thịt bò cải bó xôi' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Đang cập nhật…')).not.toBeInTheDocument();
    expect(reasons).toEqual(['missing_ingredient', 'faster']);
  });

  it('swaps on "Chọn món này", refreshes the day and goes back (FR-045)', async () => {
    serveSuggestions();
    const bodies: unknown[] = [];
    let dayRequests = 0;
    server.use(
      http.post(`${API}/meals/:mealId/swap`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(mealFixture());
      }),
      http.get(`${API}/children/:childId/days/:date`, () => {
        dayRequests += 1;
        return HttpResponse.json({
          date: '2026-09-24',
          plannable: true,
          meals: [],
          unfilledSlots: [],
          nextMealId: null,
        });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp(SWAP_URL);
    await user.click(await screen.findByRole('button', { name: 'Chọn món này' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(bodies).toEqual([
      {
        dishId: 'dish_chao_bo_cai_bo_xoi',
        reason: 'missing_ingredient',
        expectedDishId: 'dish_chao_ca_hoi_rau_ngot',
      },
    ]);
    await waitFor(() => expect(dayRequests).toBeGreaterThan(0));
  });

  it('sends the reason chosen with the swap', async () => {
    serveSuggestions();
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/meals/:mealId/swap`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(mealFixture());
      }),
    );
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    await screen.findByRole('article', { name: 'Cháo thịt bò cải bó xôi' });
    await user.click(screen.getByRole('button', { name: 'Bé không thích' }));
    await user.click(await screen.findByRole('button', { name: 'Chọn Cháo cá lóc bí xanh' }));
    await waitFor(() =>
      expect(bodies).toEqual([
        {
          dishId: 'dish_chao_ca_loc_bi_xanh',
          reason: 'disliked',
          expectedDishId: 'dish_chao_ca_hoi_rau_ngot',
        },
      ]),
    );
  });

  it('sends one swap for a double tap, every choice locked while it runs (TC-UI-016)', async () => {
    serveSuggestions();
    let calls = 0;
    server.use(
      http.post(`${API}/meals/:mealId/swap`, async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(mealFixture());
      }),
    );
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    const best = await screen.findByRole('button', { name: 'Chọn món này' });
    await user.dblClick(best);
    expect(screen.getByRole('button', { name: 'Chọn Súp khoai lang đậu Hà Lan' })).toBeDisabled();
    await waitFor(() => expect(calls).toBe(1));
  });

  it('explains a refusal and reloads the suggestions (dish no longer safe)', async () => {
    const reasons = serveSuggestions();
    server.use(
      http.post(`${API}/meals/:mealId/swap`, () => problem(422, 'DISH_NOT_SAFE_FOR_CHILD')),
    );
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    await user.click(await screen.findByRole('button', { name: 'Chọn món này' }));
    expect(
      await screen.findByText(
        'Món này không còn an toàn cho bé. Danh sách gợi ý đã được cập nhật.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(reasons).toHaveLength(2));
  });

  it('TC-FAM-021 says another member changed the meal, and reloads', async () => {
    const reasons = serveSuggestions();
    server.use(http.post(`${API}/meals/:mealId/swap`, () => problem(409, 'MEAL_CHANGED')));
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    await user.click(await screen.findByRole('button', { name: 'Chọn món này' }));
    expect(await screen.findByText(/vừa được người nhà đổi sang món khác/)).toBeInTheDocument();
    await waitFor(() => expect(reasons).toHaveLength(2));
  });

  it('TC-SWP-002 says when nothing is quicker than the current dish', async () => {
    serveSuggestions((reason) => swapFixture({ reason: reason as 'faster', ranked: [] }));
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    await user.click(await screen.findByRole('button', { name: 'Cần nấu nhanh hơn' }));
    expect(await screen.findByText('Không có món nào nhanh hơn món hiện tại.')).toBeInTheDocument();
  });

  it('UC-06 2b offers the library when no dish fits', async () => {
    serveSuggestions(() => swapFixture({ ranked: [] }));
    renderApp(SWAP_URL);
    expect(await screen.findByText('Chưa có món phù hợp để thay.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở thư viện món' })).toHaveAttribute(
      'href',
      '/dishes',
    );
  });

  it.each([
    [409, 'MEAL_ALREADY_LOGGED', 'Bữa này đã được ghi nhận, không thể thay đổi nữa.'],
    [404, 'MEAL_NOT_FOUND', 'Không tìm thấy bữa ăn này.'],
    [422, 'MEAL_IN_PAST', 'Không thể đổi món cho ngày đã qua.'],
  ])('explains a meal that cannot be swapped (%i %s)', async (status, code, text) => {
    server.use(http.get(`${API}/meals/:mealId/swap-suggestions`, () => problem(status, code)));
    renderApp(SWAP_URL);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang Hôm nay' })).toHaveAttribute('href', '/');
  });

  it('offers a retry when loading fails for another reason (TC-UI-013)', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/meals/:mealId/swap-suggestions`, () => {
        attempts += 1;
        return attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(swapFixture());
      }),
    );
    const user = userEvent.setup();
    renderApp(SWAP_URL);
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('article', { name: 'Cháo thịt bò cải bó xôi' })).toBeVisible();
  });

  it('"Đóng" goes back where the parent came from, or to Today after a deep link', async () => {
    serveSuggestions();
    const user = userEvent.setup();
    const { router } = renderApp('/profile');
    await screen.findByRole('heading', { level: 1, name: 'Na' });
    await router.navigate(SWAP_URL);
    await user.click(await screen.findByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'));

    const deep = renderApp(SWAP_URL);
    await user.click(await within(deep.container).findByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(deep.router.state.location.pathname).toBe('/'));
  });

  it('is reached from "Đổi món" on Today', async () => {
    serveSuggestions();
    const user = userEvent.setup();
    const { router } = renderApp('/');
    const card = within(await screen.findByRole('region', { name: 'Bữa tiếp theo' }));
    await user.click(card.getByRole('link', { name: 'Đổi món' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(SWAP_URL));
    expect(await screen.findByRole('region', { name: 'Gợi ý thay thế' })).toBeInTheDocument();
  });
});
