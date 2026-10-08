import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { RecipeDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { LUNCH_ID, NA_ID, recipeFixture } from '../test/fixtures';
import { server } from '../test/server';

const DISH = 'dish_chao_ca_hoi_rau_ngot';

/** Serves the recipe like the API: the requested stage if the dish has it, else the child's. */
function serveRecipe(recipe: RecipeDto = recipeFixture()) {
  const stages: (string | null)[] = [];
  server.use(
    http.get(`${API}/children/:childId/dishes/:dishId`, ({ params, request }) => {
      expect(params.childId).toBe(NA_ID);
      if (params.dishId !== recipe.id) return problem(404, 'DISH_NOT_FOUND');
      const stage = new URL(request.url).searchParams.get('stage');
      stages.push(stage);
      return HttpResponse.json({
        ...recipe,
        selectedStage: stage ? Number(stage) : recipe.selectedStage,
      });
    }),
  );
  return stages;
}

const section = (name: string) => within(screen.getByRole('region', { name }));

beforeEach(() => server.use(signedIn()));

describe('Recipe (S03)', () => {
  it('shows the recipe for the child stage when opened from a meal', async () => {
    const stages = serveRecipe();
    renderApp(`/dishes/${DISH}?meal=${LUNCH_ID}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cháo cá hồi rau ngót' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ảnh món ăn')).toBeInTheDocument();
    expect(screen.getByText('Đã duyệt nội dung')).toBeInTheDocument();
    expect(screen.getByText('Công thức v3')).toBeInTheDocument();
    expect(screen.getByText(/Cháo gạo tẻ nấu nhừ/)).toBeInTheDocument();

    const facts = within(screen.getByRole('list', { name: 'Thông tin món' }));
    expect(facts.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Sơ chế10 phút',
      'Nấu15 phút',
      'Kết cấuLợn cợn',
      'Dụng cụNồi',
    ]);

    await screen.findByRole('tab', { name: '8–9 tháng' });
    const byAge = section('Hướng dẫn theo độ tuổi');
    expect(byAge.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '6–7 tháng',
      '8–9 tháng',
      '10–12 tháng',
    ]);
    expect(byAge.getByRole('tab', { name: '8–9 tháng' })).toHaveAttribute('aria-selected', 'true');
    expect(byAge.getByText('120–150 ml tham khảo')).toBeInTheDocument();

    const ingredients = section('Nguyên liệu');
    expect(ingredients.getByText('Đạt 4/4 nhóm')).toBeInTheDocument();
    expect(ingredients.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Gạo tẻ20 gTinh bột',
      'Cá hồi phi lê25 gĐạm',
      'Rau ngót · lần đầu15 gRau củ',
      'Dầu ăn dặm5 mlChất béo',
    ]);

    const safety = section('Lưu ý an toàn');
    expect(safety.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Chứa chất gây dị ứng thường gặp: cá.',
      'Gỡ và kiểm tra kỹ xương cá trước khi nghiền.',
      'Không thêm muối, nước mắm hay đường cho bé dưới 1 tuổi.',
    ]);

    expect(section('Cách làm').getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Đổi món' })).toHaveAttribute(
      'href',
      `/meals/${LUNCH_ID}/swap`,
    );
    expect(stages).toEqual([null]);
  });

  it('switches the texture and portion by age tab, keeping the page while it loads', async () => {
    const stages = serveRecipe();
    const user = userEvent.setup();
    renderApp(`/dishes/${DISH}?meal=${LUNCH_ID}`);
    const tab = await screen.findByRole('tab', { name: '10–12 tháng' });
    await user.click(tab);
    expect(await screen.findByText('Khoảng 125 ml')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '10–12 tháng' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(section('Hướng dẫn theo độ tuổi').getByText('Cắt nhỏ, mềm')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(stages).toEqual([null, '3']);
  });

  it('opened from the library: back to the library and no swap', async () => {
    serveRecipe();
    renderApp(`/dishes/${DISH}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/dishes');
    expect(screen.queryByRole('link', { name: 'Đổi món' })).not.toBeInTheDocument();
  });

  it('says plainly when the content has not been reviewed yet', async () => {
    serveRecipe(recipeFixture({ reviewedBy: null, contentVersion: 1 }));
    renderApp(`/dishes/${DISH}`);
    expect(await screen.findByText('Chưa được chuyên gia duyệt')).toBeInTheDocument();
    expect(screen.getByText('Công thức v1')).toBeInTheDocument();
  });

  it.each([
    ['allergen', 'Món có chất gây dị ứng bé cần tránh.'],
    ['sick_new', 'Món có thực phẩm mới — chưa nên thử khi bé đang mệt.'],
  ] as const)('warns when the dish is not safe for the child now (%s)', async (exclusion, text) => {
    serveRecipe(recipeFixture({ exclusion }));
    renderApp(`/dishes/${DISH}`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Món này hiện không phù hợp với bé');
    expect(alert).toHaveTextContent(text);
  });

  it('shows a snack without a group score, and no safety box when there is nothing to say', async () => {
    serveRecipe(
      recipeFixture({
        mealType: 'snack',
        allergens: [],
        safetyNotes: [],
        foodGroups: ['veg'],
        ingredients: [
          {
            ingredientId: 'ing_le',
            name: 'Lê',
            qty: 0.5,
            unit: 'g',
            isMain: true,
            foodGroup: 'fruit',
            allergenTags: [],
            isNew: false,
          },
        ],
      }),
    );
    renderApp(`/dishes/${DISH}`);
    const ingredients = within(await screen.findByRole('region', { name: 'Nguyên liệu' }));
    expect(ingredients.getByText('0,5 g')).toBeInTheDocument();
    expect(ingredients.getByText('Trái cây')).toBeInTheDocument();
    expect(ingredients.queryByText(/Đạt \d\/4 nhóm/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lưu ý an toàn' })).not.toBeInTheDocument();
  });

  it('lists every allergen of the dish', async () => {
    serveRecipe(recipeFixture({ allergens: ['fish', 'wheat'], safetyNotes: [] }));
    renderApp(`/dishes/${DISH}`);
    const safety = within(await screen.findByRole('region', { name: 'Lưu ý an toàn' }));
    expect(safety.getByRole('listitem')).toHaveTextContent(
      'Chứa chất gây dị ứng thường gặp: cá, lúa mì.',
    );
  });

  it('shows the dish photo when there is one', async () => {
    serveRecipe(recipeFixture({ imageUrl: 'https://cdn.example/chao.jpg' }));
    renderApp(`/dishes/${DISH}`);
    expect(await screen.findByRole('img', { name: 'Cháo cá hồi rau ngót' })).toHaveAttribute(
      'src',
      'https://cdn.example/chao.jpg',
    );
    expect(screen.queryByText('Ảnh món ăn')).not.toBeInTheDocument();
  });

  it('"Bắt đầu nấu" brings the steps into view and moves focus there', async () => {
    serveRecipe();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    renderApp(`/dishes/${DISH}`);
    await user.click(await screen.findByRole('button', { name: 'Bắt đầu nấu' }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(screen.getByRole('heading', { name: 'Cách làm' })).toHaveFocus();
  });

  it('does not animate the scroll for people who reduce motion (TC-UI-012)', async () => {
    serveRecipe();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const user = userEvent.setup();
    renderApp(`/dishes/${DISH}`);
    await user.click(await screen.findByRole('button', { name: 'Bắt đầu nấu' }));
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('labels age tabs by stage number while the stage list is loading', async () => {
    serveRecipe();
    server.use(http.get(`${API}/stages`, () => new Promise(() => {})));
    renderApp(`/dishes/${DISH}`);
    expect(await screen.findByRole('tab', { name: 'Giai đoạn 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('explains an unknown dish and offers the way back', async () => {
    serveRecipe();
    renderApp(`/dishes/dish_khong_co?meal=${LUNCH_ID}`);
    expect(await screen.findByText('Không tìm thấy món ăn này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/');
  });

  it('shows loading, then lets the parent retry after a failure (TC-UI-013)', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/children/:childId/dishes/:dishId`, () => {
        attempts += 1;
        return attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(recipeFixture());
      }),
    );
    const user = userEvent.setup();
    renderApp(`/dishes/${DISH}`);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…');
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Cháo cá hồi rau ngót' })).toBeVisible(),
    );
  });

  it('TC-CUS-016 a parent’s own dish: not reviewed, any quantity, a way to edit it', async () => {
    serveRecipe(
      recipeFixture({
        id: 'custom_1',
        name: 'Cháo gà nhà làm',
        custom: true,
        reviewedBy: null,
        description: '',
        tool: '',
        ingredients: [
          {
            ingredientId: 'ing_gao_te',
            name: 'Gạo tẻ',
            qty: null,
            unit: null,
            isMain: false,
            foodGroup: 'carb',
            allergenTags: [],
            isNew: false,
          },
          {
            ingredientId: 'ing_thit_ga',
            name: 'Thịt gà',
            qty: 2,
            unit: null,
            isMain: true,
            foodGroup: 'protein',
            allergenTags: [],
            isNew: false,
          },
        ],
      }),
    );
    renderApp('/dishes/custom_1');
    expect(await screen.findByText('Món của bạn')).toBeInTheDocument();
    expect(
      screen.getByText('Món do bạn tạo, chưa qua chuyên gia dinh dưỡng duyệt.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Công thức v/)).not.toBeInTheDocument();
    expect(screen.queryByText('Dụng cụ')).not.toBeInTheDocument();
    expect(section('Nguyên liệu').getByText('Tùy ý')).toBeInTheDocument();
    expect(section('Nguyên liệu').getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sửa món' })).toHaveAttribute(
      'href',
      '/dishes/custom_1/edit',
    );
  });
});
