import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { CustomDishInputDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { CUSTOM_ID, NA_ID, customDishFormFixture, recipeFixture } from '../test/fixtures';
import { server } from '../test/server';

const FOODS = [
  { id: 'ing_gao_te', name: 'Gạo tẻ', foodGroup: 'carb' },
  { id: 'ing_thit_ga', name: 'Thịt gà', foodGroup: 'protein' },
  { id: 'ing_bi_do', name: 'Bí đỏ', foodGroup: 'veg' },
  { id: 'ing_chuoi', name: 'Chuối', foodGroup: 'fruit' },
];

function serveSearch() {
  server.use(
    http.get(`${API}/ingredients`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')!.toLowerCase();
      return HttpResponse.json(
        FOODS.filter((f) => f.name.toLowerCase().includes(q)).map((f) => ({
          ...f,
          proteinSource: null,
          allergenTags: [],
        })),
      );
    }),
  );
}

function serveSave(method: 'post' | 'put', reply: () => Response) {
  const sent: CustomDishInputDto[] = [];
  const path =
    method === 'post'
      ? `${API}/children/:childId/custom-dishes`
      : `${API}/children/:childId/custom-dishes/:dishId`;
  server.use(
    http[method](path, async ({ params, request }) => {
      expect(params.childId).toBe(NA_ID);
      sent.push((await request.json()) as CustomDishInputDto);
      return reply();
    }),
  );
  return sent;
}

const created = () =>
  HttpResponse.json(recipeFixture({ id: CUSTOM_ID, name: 'Cháo gà bí đỏ', custom: true }), {
    status: 201,
  });

async function addFood(user: ReturnType<typeof userEvent.setup>, query: string, name: string) {
  const box = screen.getByLabelText('Tìm nguyên liệu');
  await user.clear(box);
  await user.type(box, query);
  await user.click(await screen.findByRole('button', { name: `Thêm ${name}` }));
}

beforeEach(() => {
  sessionStorage.clear();
  server.use(signedIn());
  server.use(
    http.get(`${API}/children/:childId/dishes/:dishId`, () =>
      HttpResponse.json(recipeFixture({ id: CUSTOM_ID, custom: true })),
    ),
  );
});

describe('Create a dish (G15)', () => {
  it('TC-CUS-001 builds the dish, shows its food groups, saves and opens its recipe', async () => {
    serveSearch();
    const sent = serveSave('post', created);
    const user = userEvent.setup();
    const { router } = renderApp('/dishes/new');
    expect(await screen.findByRole('heading', { name: 'Tạo món của bạn' })).toBeInTheDocument();
    expect(screen.getByText('Thêm nguyên liệu để xem nhóm chất')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên món'), 'Cháo gà bí đỏ');
    await addFood(user, 'gạo', 'Gạo tẻ');
    await addFood(user, 'gà', 'Thịt gà');
    await addFood(user, 'chuối', 'Chuối');
    const section = within(screen.getByRole('region', { name: 'Nguyên liệu' }));
    expect(section.getByText('Tinh bột')).toBeInTheDocument();
    expect(section.getByText('Rau củ')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Định lượng Thịt gà'), '30,5');
    await user.type(screen.getByLabelText('Đơn vị Thịt gà'), 'g');
    await user.click(screen.getByRole('button', { name: 'Bỏ Chuối' }));
    await user.type(screen.getByLabelText('Bước 1'), 'Vo gạo');
    await user.click(screen.getByRole('button', { name: 'Thêm bước' }));
    await user.type(screen.getByLabelText('Bước 2'), '   ');
    await user.click(screen.getByRole('button', { name: 'Thêm bước' }));
    await user.click(screen.getByRole('button', { name: 'Xóa bước 3' }));
    const cook = screen.getByLabelText('Nấu (phút)');
    await user.clear(cook);
    await user.type(cook, '2a5');
    await user.click(screen.getByRole('button', { name: 'Lưu món' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/dishes/${CUSTOM_ID}`));
    expect(sent).toEqual([
      {
        name: 'Cháo gà bí đỏ',
        mealType: 'main',
        ingredients: [
          { id: 'ing_gao_te', qty: null, unit: null },
          { id: 'ing_thit_ga', qty: 30.5, unit: 'g' },
        ],
        prepMin: 10,
        cookMin: 25,
        steps: ['Vo gạo'],
      },
    ]);
    expect(sessionStorage.getItem('custom-dish-draft:new')).toBeNull();
  });

  it('a snack is not scored on the 4 groups; empty times are sent as 0', async () => {
    serveSearch();
    const sent = serveSave('post', created);
    const user = userEvent.setup();
    renderApp('/dishes/new');
    await user.type(await screen.findByLabelText('Tên món'), 'Chuối nghiền');
    await user.click(screen.getByRole('button', { name: 'Bữa phụ' }));
    expect(screen.getByRole('button', { name: 'Bữa phụ' })).toHaveAttribute('aria-pressed', 'true');
    await addFood(user, 'chuối', 'Chuối');
    expect(screen.queryByText(/Đạt \d\/4 nhóm/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Sơ chế (phút)'));
    await user.click(screen.getByRole('button', { name: 'Lưu món' }));
    await waitFor(() => expect(sent[0]).toMatchObject({ mealType: 'snack', prepMin: 0 }));
  });

  it('TC-CUS-002 names the unsafe foods the server found', async () => {
    serveSearch();
    serveSave('post', () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'x',
          status: 422,
          code: 'DISH_NOT_SAFE_FOR_CHILD',
          instance: '/x',
          ingredients: [
            { id: 'ing_trung_ga', name: 'Trứng gà', reason: 'allergen' },
            { id: 'ing_mat_ong', name: 'Mật ong', reason: 'age' },
          ],
        },
        { status: 422 },
      ),
    );
    const user = userEvent.setup();
    renderApp('/dishes/new');
    await user.type(await screen.findByLabelText('Tên món'), 'Trứng hấp');
    await addFood(user, 'gạo', 'Gạo tẻ');
    await user.click(screen.getByRole('button', { name: 'Lưu món' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Món có nguyên liệu không phù hợp với bé lúc này:');
    expect(alert).toHaveTextContent('Trứng gà — chất gây dị ứng cần tránh');
    expect(alert).toHaveTextContent('Mật ong — chưa hợp độ tuổi');
  });

  it.each([
    [problem(400, 'INVALID_CUSTOM_DISH'), 'Thông tin món chưa hợp lệ.'],
    [problem(409, 'DISH_NAME_TAKEN'), 'Bạn đã có món trùng tên.'],
  ])('shows other refusals in words (%#)', async (reply, message) => {
    serveSave('post', () => reply.clone());
    const user = userEvent.setup();
    renderApp('/dishes/new');
    await user.type(await screen.findByLabelText('Tên món'), 'A');
    await user.click(screen.getByRole('button', { name: 'Lưu món' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('says which field is wrong', async () => {
    serveSave('post', () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'x',
          status: 400,
          code: 'INVALID_CUSTOM_DISH',
          instance: '/x',
          field: 'name',
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderApp('/dishes/new');
    await user.type(await screen.findByLabelText('Tên món'), 'A');
    await user.click(screen.getByRole('button', { name: 'Lưu món' }));
    expect(await screen.findByText('Tên món cần từ 2 đến 60 ký tự.')).toBeInTheDocument();
  });

  it('TC-CUS-017 keeps the draft when leaving and coming back', async () => {
    serveSearch();
    const user = userEvent.setup();
    const first = renderApp('/dishes/new');
    await user.type(await screen.findByLabelText('Tên món'), 'Cháo nháp');
    await addFood(user, 'bí', 'Bí đỏ');
    first.unmount();
    renderApp('/dishes/new');
    expect(await screen.findByLabelText('Tên món')).toHaveValue('Cháo nháp');
    expect(screen.getByText('Bí đỏ')).toBeInTheDocument();
  });

  it('searches the catalog: no result, an error, and foods already added are not offered again', async () => {
    serveSearch();
    const user = userEvent.setup();
    renderApp('/dishes/new');
    await screen.findByLabelText('Tên món');
    await addFood(user, 'gạo', 'Gạo tẻ');
    await user.type(screen.getByLabelText('Tìm nguyên liệu'), 'gạo');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Thêm Gạo tẻ' })).not.toBeInTheDocument(),
    );
    await user.clear(screen.getByLabelText('Tìm nguyên liệu'));
    await user.type(screen.getByLabelText('Tìm nguyên liệu'), 'pizza');
    expect(await screen.findByText('Không tìm thấy nguyên liệu phù hợp')).toBeInTheDocument();
    server.use(http.get(`${API}/ingredients`, () => HttpResponse.error()));
    await user.clear(screen.getByLabelText('Tìm nguyên liệu'));
    await user.type(screen.getByLabelText('Tìm nguyên liệu'), 'xyz');
    expect(await screen.findByText(/Không kết nối được máy chủ/)).toBeInTheDocument();
  });

  it('stops offering foods at 15 and steps at 15', async () => {
    sessionStorage.setItem(
      'custom-dish-draft:new',
      JSON.stringify({
        name: 'Đầy',
        mealType: 'main',
        ingredients: Array.from({ length: 15 }, (_, i) => ({
          id: `ing_${i}`,
          name: `Món ${i}`,
          foodGroup: 'veg',
          qty: '',
          unit: '',
        })),
        prepMin: '1',
        cookMin: '1',
        steps: Array(15).fill('b'),
      }),
    );
    renderApp('/dishes/new');
    expect(await screen.findByLabelText('Tên món')).toHaveValue('Đầy');
    expect(screen.queryByLabelText('Tìm nguyên liệu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm bước' })).not.toBeInTheDocument();
  });
});

describe('Edit and delete a dish (FR-135/136)', () => {
  function serveForm(reply: () => Response = () => HttpResponse.json(customDishFormFixture())) {
    server.use(http.get(`${API}/children/:childId/custom-dishes/:dishId`, reply));
  }

  it('starts from the dish as entered and saves the changes', async () => {
    serveForm();
    const sent = serveSave('put', () =>
      HttpResponse.json(recipeFixture({ id: CUSTOM_ID, custom: true })),
    );
    const user = userEvent.setup();
    const { router } = renderApp(`/dishes/${CUSTOM_ID}/edit`);
    expect(await screen.findByRole('heading', { name: 'Sửa món' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Tên món')).toHaveValue('Cháo gà bí đỏ nhà làm');
    expect(screen.getByLabelText('Định lượng Thịt gà')).toHaveValue('30');
    expect(screen.getByLabelText('Bước 2')).toHaveValue('Nấu cháo');
    await user.clear(screen.getByLabelText('Tên món'));
    await user.type(screen.getByLabelText('Tên món'), 'Cháo gà');
    await user.click(screen.getByRole('button', { name: 'Lưu món' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/dishes/${CUSTOM_ID}`));
    expect(sent[0]).toMatchObject({
      name: 'Cháo gà',
      ingredients: [
        { id: 'ing_gao_te', qty: null, unit: null },
        { id: 'ing_thit_ga', qty: 30, unit: 'g' },
      ],
    });
  });

  it('starts with one empty step when the dish has none', async () => {
    serveForm(() => HttpResponse.json(customDishFormFixture({ steps: [] })));
    renderApp(`/dishes/${CUSTOM_ID}/edit`);
    expect(await screen.findByLabelText('Bước 1')).toHaveValue('');
  });

  it('TC-CUS-013 deletes only after confirming, then returns to the library', async () => {
    serveForm();
    let deleted = 0;
    server.use(
      http.delete(`${API}/children/:childId/custom-dishes/:dishId`, ({ params }) => {
        expect(params.dishId).toBe(CUSTOM_ID);
        deleted += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp(`/dishes/${CUSTOM_ID}/edit`);
    await user.click(await screen.findByRole('button', { name: 'Xóa món' }));
    expect(screen.getByText(/các bữa đã ăn vẫn giữ tên món/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(deleted).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Xóa món' }));
    const buttons = screen.getAllByRole('button', { name: 'Xóa món' });
    await user.click(buttons.at(-1)!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/dishes'));
    expect(deleted).toBe(1);
  });

  it('reports a failed deletion', async () => {
    serveForm();
    server.use(
      http.delete(`${API}/children/:childId/custom-dishes/:dishId`, () =>
        problem(404, 'DISH_NOT_FOUND'),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/dishes/${CUSTOM_ID}/edit`);
    await user.click(await screen.findByRole('button', { name: 'Xóa món' }));
    await user.click(screen.getAllByRole('button', { name: 'Xóa món' }).at(-1)!);
    expect(await screen.findByText('Không tìm thấy món ăn này.')).toBeInTheDocument();
  });

  it('retries loading the dish', async () => {
    let attempts = 0;
    serveForm(() =>
      ++attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(customDishFormFixture()),
    );
    const user = userEvent.setup();
    renderApp(`/dishes/${CUSTOM_ID}/edit`);
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Tên món')).toHaveValue('Cháo gà bí đỏ nhà làm');
  });

  it('goes back to the recipe', async () => {
    serveForm();
    const user = userEvent.setup();
    const { router } = renderApp(`/dishes/${CUSTOM_ID}/edit`);
    await user.click(await screen.findByRole('link', { name: 'Quay lại' }));
    await act(async () => {});
    expect(router.state.location.pathname).toBe(`/dishes/${CUSTOM_ID}`);
  });
});
