import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { LibraryDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { NA_ID, childFixture, libraryFixture } from '../test/fixtures';
import { server } from '../test/server';

/** Serves the library and records each query string the page asked for. */
function serveLibrary(answer: (params: URLSearchParams) => LibraryDto = () => libraryFixture()) {
  const queries: string[] = [];
  server.use(
    http.get(`${API}/children/:childId/dishes`, ({ params, request }) => {
      expect(params.childId).toBe(NA_ID);
      const search = new URL(request.url).searchParams;
      queries.push(search.toString());
      return HttpResponse.json(answer(search));
    }),
  );
  return queries;
}

const card = (name: string) => within(screen.getByRole('link', { name: new RegExp(name) }));

beforeEach(() => server.use(signedIn()));

describe('Dishes (S05)', () => {
  it('says what the list is filtered for and shows the cards (FR-049)', async () => {
    const queries = serveLibrary();
    renderApp('/dishes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Món ăn' })).toBeInTheDocument();
    expect(
      screen.getByText('Đã lọc cho bé Na · Giai đoạn 2 · tránh trứng, mướp đắng'),
    ).toBeInTheDocument();
    expect(await screen.findByText('3 món phù hợp')).toBeInTheDocument();

    const salmon = card('Cháo cá hồi rau ngót');
    expect(salmon.getByText('25 phút · Lợn cợn')).toBeInTheDocument();
    expect(salmon.getByText('Cá')).toBeInTheDocument();
    expect(salmon.getByText('Lần đầu: rau ngót')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cháo cá hồi rau ngót/ })).toHaveAttribute(
      'href',
      '/dishes/dish_chao_ca_hoi_rau_ngot',
    );

    const chicken = card('Cháo thịt gà bí đỏ');
    expect(chicken.getAllByText(/./).map((e) => e.textContent)).toEqual(
      expect.arrayContaining(['Gà', 'Bé thích', 'Ăn 2 ngày trước']),
    );
    expect(card('Bột yến mạch chuối').getByText('Bữa phụ')).toBeInTheDocument();
    expect(card('Bột yến mạch chuối').getByText('Ăn sáng nay')).toBeInTheDocument();
    expect(queries).toEqual(['']);
    expect(screen.getByRole('link', { name: 'Món ăn', current: 'page' })).toBeInTheDocument();
  });

  it('describes a child with nothing to avoid without the "tránh" part', async () => {
    serveLibrary();
    server.use(
      http.get(`${API}/children`, () =>
        HttpResponse.json([childFixture({ avoidAllergens: [], avoidIngredients: [] })]),
      ),
    );
    renderApp('/dishes');
    expect(await screen.findByText('Đã lọc cho bé Na · Giai đoạn 2')).toBeInTheDocument();
  });

  it('filters by chip, one at a time, kept in the address (FR-047)', async () => {
    const queries = serveLibrary();
    const user = userEvent.setup();
    const { router } = renderApp('/dishes');
    const chips = within(await screen.findByRole('group', { name: 'Lọc theo nhóm' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Tất cả',
      'Gà',
      'Cá',
      'Bò',
      'Heo',
      'Đậu',
      'Bữa phụ',
      'Món của bạn',
    ]);
    expect(chips.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(chips.getByRole('button', { name: 'Cá' }));
    expect(chips.getByRole('button', { name: 'Cá' })).toHaveAttribute('aria-pressed', 'true');
    expect(chips.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(queries).toContain('chip=fish'));
    expect(router.state.location.search).toBe('?chip=fish');
    // Pressing the active chip again keeps it; "Tất cả" clears the filter.
    await user.click(chips.getByRole('button', { name: 'Cá' }));
    expect(chips.getByRole('button', { name: 'Cá' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(chips.getByRole('button', { name: 'Tất cả' }));
    expect(router.state.location.search).toBe('');
  });

  it('searches as the parent types, after a short pause (FR-046)', async () => {
    const queries = serveLibrary();
    const user = userEvent.setup();
    const { router } = renderApp('/dishes');
    const box = await screen.findByRole('searchbox', { name: 'Tìm món' });
    expect(box).toHaveAttribute('placeholder', 'Tìm món hoặc nguyên liệu');
    await user.type(box, 'gà');
    await waitFor(() => expect(queries).toContain(`q=${encodeURIComponent('gà')}`));
    // One request for the word, not one per letter.
    expect(queries.filter((q) => q.startsWith('q='))).toHaveLength(1);
    expect(router.state.location.search).toBe(`?q=${encodeURIComponent('gà')}`);
    await user.clear(box);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('"Chưa ăn 7 ngày" asks for fresh dishes only (FR-048)', async () => {
    const queries = serveLibrary();
    const user = userEvent.setup();
    renderApp('/dishes');
    const toggle = await screen.findByRole('switch', { name: 'Chưa ăn 7 ngày' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(queries).toContain('fresh=true'));
  });

  it('TC-LIB-008 restores every filter from a deep link', async () => {
    const queries = serveLibrary();
    renderApp('/dishes?q=bo&chip=beef&fresh=1');
    expect(await screen.findByRole('searchbox', { name: 'Tìm món' })).toHaveValue('bo');
    expect(screen.getByRole('button', { name: 'Bò' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch', { name: 'Chưa ăn 7 ngày' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await waitFor(() => expect(queries).toEqual(['q=bo&chip=beef&fresh=true']));
  });

  it('TC-LIB-008 ignores an unknown chip in the address', async () => {
    const queries = serveLibrary();
    renderApp('/dishes?chip=xyz');
    expect(await screen.findByRole('button', { name: 'Tất cả' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => expect(queries).toEqual(['']));
  });

  it('TC-LIB-002 suggests dropping "Chưa ăn 7 ngày" when nothing is left', async () => {
    serveLibrary((params) =>
      params.get('fresh') ? libraryFixture({ dishes: [] }) : libraryFixture(),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/dishes?fresh=1');
    expect(await screen.findByText('Chưa có món phù hợp trong nhóm này.')).toBeInTheDocument();
    expect(screen.getByText('0 món phù hợp')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bỏ lọc “Chưa ăn 7 ngày”' }));
    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('3 món phù hợp')).toBeInTheDocument();
  });

  it('says which word found nothing', async () => {
    serveLibrary(() =>
      libraryFixture({
        dishes: [],
        hidden: {
          total: 0,
          byReason: { allergen: 0, avoid: 0, paused: 0, age: 0, refused: 0, sick_new: 0 },
          items: [],
        },
      }),
    );
    renderApp('/dishes?q=pizza');
    expect(await screen.findByText('Không tìm thấy món khớp “pizza”.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bỏ lọc/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Món đang ẩn' })).not.toBeInTheDocument();
  });

  it('explains the hidden dishes and lists them on request (FR-050)', async () => {
    serveLibrary();
    const user = userEvent.setup();
    renderApp('/dishes');
    const hidden = within(await screen.findByRole('region', { name: 'Món đang ẩn' }));
    expect(hidden.getByText('Đang ẩn 5 món không phù hợp')).toBeInTheDocument();
    expect(
      hidden.getByText('3 món chứa trứng (cần tránh) · 2 món chưa hợp độ tuổi'),
    ).toBeInTheDocument();
    const toggle = hidden.getByRole('button', { name: 'Xem các món đang ẩn' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(hidden.queryByRole('list')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(hidden.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(hidden.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Cháo trứng cà rốt — có chất gây dị ứng cần tránh',
      'Trứng hấp rau — có chất gây dị ứng cần tránh',
      'Bánh trứng sữa — có chất gây dị ứng cần tránh',
      'Cơm nát cá — chưa hợp độ tuổi',
      'Mì gà cắt nhỏ — chưa hợp độ tuổi',
    ]);
    await user.click(hidden.getByRole('button', { name: 'Thu gọn' }));
    expect(hidden.queryByRole('list')).not.toBeInTheDocument();
  });

  it('TC-LIB-003 a word matching only hidden dishes: zero results and why', async () => {
    serveLibrary(() =>
      libraryFixture({
        dishes: [],
        hidden: {
          total: 1,
          byReason: { allergen: 1, avoid: 0, paused: 0, age: 0, refused: 0, sick_new: 0 },
          items: [{ dishId: 'dish_chao_trung', name: 'Cháo trứng cà rốt', reason: 'allergen' }],
        },
      }),
    );
    renderApp(`/dishes?q=${encodeURIComponent('trứng')}`);
    const hidden = within(await screen.findByRole('region', { name: 'Món đang ẩn' }));
    expect(hidden.getByText('1 món khớp từ khóa đang bị ẩn')).toBeInTheDocument();
    expect(hidden.getByText('1 món chứa trứng (cần tránh)')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy món khớp “trứng”.')).toBeInTheDocument();
  });

  it('does not ask for the library of a child outside 6–24 months', async () => {
    const queries = serveLibrary();
    server.use(
      http.get(`${API}/children`, () =>
        HttpResponse.json([
          childFixture({
            age: { months: 4, days: 0, corrected: false },
            effectiveStage: null,
            plannable: false,
            notPlannableReason: 'too_young',
          }),
        ]),
      ),
    );
    renderApp('/dishes');
    expect(
      await screen.findByText('Dưới 6 tháng, ứng dụng chưa lập thực đơn ăn dặm.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(queries).toEqual([]);
  });

  it('lets the parent retry after a failure (TC-UI-013)', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/children/:childId/dishes`, () => {
        attempts += 1;
        return attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(libraryFixture());
      }),
    );
    const user = userEvent.setup();
    renderApp('/dishes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Món ăn' })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('3 món phù hợp')).toBeInTheDocument();
  });

  it('TC-CUS-009 marks the parents’ dishes and offers to create one', async () => {
    serveLibrary(() =>
      libraryFixture({
        dishes: [
          { ...libraryFixture().dishes[0]!, id: 'custom_1', name: 'Cháo nhà làm', custom: true },
        ],
      }),
    );
    renderApp('/dishes');
    await screen.findByText('Cháo nhà làm');
    expect(card('Cháo nhà làm').getByText('Món của bạn')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo món' })).toHaveAttribute('href', '/dishes/new');
  });
});
