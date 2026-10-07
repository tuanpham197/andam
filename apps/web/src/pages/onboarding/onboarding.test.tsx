import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, children, problem, signedIn } from '../../test/api';
import { renderApp } from '../../test/app';
import { childFixture } from '../../test/fixtures';
import { server } from '../../test/server';

beforeEach(() => sessionStorage.clear());

const next = () => userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

async function stepOne(name = 'Na') {
  await userEvent.type(await screen.findByLabelText('Tên hoặc tên gọi ở nhà của bé'), name);
  await next();
}

async function stepTwo(date = '2026-01-12') {
  fireEvent.change(await screen.findByLabelText('Ngày sinh'), { target: { value: date } });
  await next();
}

describe('onboarding (UC-01)', () => {
  it('sends a signed-in parent without a child profile to step 1', async () => {
    server.use(signedIn(), children([]));
    const { router } = renderApp('/week');
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/1'));
    expect(await screen.findByRole('progressbar', { name: 'Bước 1 trên 5' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
  });

  it('sends a parent who already has a child away from onboarding', async () => {
    server.use(signedIn());
    const { router } = renderApp('/onboarding/1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('TC-UI-013 lets the user retry when the child list cannot be loaded', async () => {
    let calls = 0;
    server.use(
      signedIn(),
      http.get(`${API}/children`, () =>
        ++calls === 1 ? HttpResponse.error() : HttpResponse.json([childFixture()]),
      ),
    );
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeInTheDocument();
  });

  it('lets the user retry when the child list fails on the onboarding screen', async () => {
    let calls = 0;
    server.use(
      signedIn(),
      http.get(`${API}/children`, () =>
        ++calls === 1 ? HttpResponse.error() : HttpResponse.json([]),
      ),
    );
    renderApp('/onboarding/1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Tên hoặc tên gọi ở nhà của bé')).toBeInTheDocument();
  });

  it('creates a premature baby with a searched ingredient to avoid', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      signedIn(),
      children([]),
      http.get(`${API}/ingredients`, () =>
        HttpResponse.json([
          {
            id: 'ing_muop_dang',
            name: 'Mướp đắng',
            foodGroup: 'veg',
            proteinSource: null,
            allergenTags: [],
          },
        ]),
      ),
      http.post(`${API}/children`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(childFixture(), { status: 201 });
      }),
    );
    renderApp('/onboarding/1');
    await stepOne('Na');
    fireEvent.change(await screen.findByLabelText('Ngày sinh'), {
      target: { value: '2026-01-12' },
    });
    await userEvent.click(screen.getByRole('switch', { name: 'Bé sinh non' }));
    const weeks = screen.getByLabelText('Sinh sớm bao nhiêu tuần?');
    await userEvent.clear(weeks);
    await userEvent.type(weeks, '3');
    await next();
    await userEvent.type(
      await screen.findByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'muop',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm Mướp đắng' }));
    await next();

    expect(await screen.findByText('Sinh sớm 3 tuần')).toBeInTheDocument();
    expect(screen.getByText('Mướp đắng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }));
    await waitFor(() => expect(body.weeksEarly).toBe(3));
    expect(body.isPremature).toBe(true);
    expect(body.avoidIngredients).toEqual([{ ingredientId: 'ing_muop_dang', reason: 'dislike' }]);
  });

  it('requires a name before continuing', async () => {
    server.use(signedIn(), children([]));
    renderApp('/onboarding/1');
    await screen.findByLabelText('Tên hoặc tên gọi ở nhà của bé');
    await next();
    expect(screen.getByLabelText('Tên hoặc tên gọi ở nhà của bé')).toHaveAccessibleDescription(
      /Nhập tên của bé/,
    );
  });

  it('refuses a name longer than 30 characters', async () => {
    server.use(signedIn(), children([]));
    renderApp('/onboarding/1');
    await stepOne('a'.repeat(31));
    expect(screen.getByLabelText('Tên hoặc tên gọi ở nhà của bé')).toHaveAccessibleDescription(
      /tối đa 30 ký tự/,
    );
  });

  it('TC-AGE-011 refuses an empty or future birth date', async () => {
    server.use(signedIn(), children([]));
    renderApp('/onboarding/1');
    await stepOne();
    await next();
    expect(screen.getByLabelText('Ngày sinh')).toHaveAccessibleDescription(/Chọn ngày sinh/);
    await stepTwo('2099-01-01');
    expect(screen.getByLabelText('Ngày sinh')).toHaveAccessibleDescription(/không thể ở tương lai/);
  });

  it('asks how many weeks early a premature baby was born (1–16)', async () => {
    server.use(signedIn(), children([]));
    const { router } = renderApp('/onboarding/1');
    await stepOne();
    fireEvent.change(await screen.findByLabelText('Ngày sinh'), {
      target: { value: '2026-01-12' },
    });
    await userEvent.click(screen.getByRole('switch', { name: 'Bé sinh non' }));
    const weeks = screen.getByLabelText('Sinh sớm bao nhiêu tuần?');
    await userEvent.clear(weeks);
    await userEvent.type(weeks, '17');
    await next();
    expect(weeks).toHaveAccessibleDescription(/từ 1 đến 16/);
    await userEvent.clear(weeks);
    await userEvent.type(weeks, '3');
    await next();
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/3'));
  });

  it('TC-UI-018 keeps what was typed when going back', async () => {
    server.use(signedIn(), children([]));
    const { router } = renderApp('/onboarding/1');
    await stepOne('Na');
    await screen.findByLabelText('Ngày sinh');
    await userEvent.click(screen.getByRole('link', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/1'));
    expect(screen.getByLabelText('Tên hoặc tên gọi ở nhà của bé')).toHaveValue('Na');
  });

  it.each(['/onboarding/3', '/onboarding/5'])(
    'sends a deep link to %s back to step 1 while the draft is empty',
    async (path) => {
      server.use(signedIn(), children([]));
      const { router } = renderApp(path);
      await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/1'));
    },
  );

  it.each(['/onboarding/0', '/onboarding/6', '/onboarding/abc'])(
    'treats the unknown step %s as step 1',
    async (path) => {
      server.use(signedIn(), children([]));
      const { router } = renderApp(path);
      await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/1'));
    },
  );

  it('skips the reaction details when there was no previous reaction, and creates the profile', async () => {
    let body: unknown;
    let hasChild = false;
    server.use(
      signedIn(),
      http.get(`${API}/children`, () => HttpResponse.json(hasChild ? [childFixture()] : [])),
      http.post(`${API}/children`, async ({ request }) => {
        body = await request.json();
        hasChild = true;
        return HttpResponse.json(childFixture(), { status: 201 });
      }),
    );
    const { router } = renderApp('/onboarding/1');
    await stepOne('Na');
    await stepTwo('2026-01-12');

    expect(
      await screen.findByRole('heading', { name: 'Bé Na cần tránh thực phẩm nào?' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trứng' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Chưa từng' }));
    await next();

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/5'));
    expect(screen.getByText('12/01/2026')).toBeInTheDocument();
    expect(screen.getByText('Trứng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(body).toEqual({
      name: 'Na',
      birthDate: '2026-01-12',
      isPremature: false,
      weeksEarly: 0,
      priorReaction: 'never',
      priorReactionNote: null,
      avoidAllergens: ['egg'],
      avoidIngredients: [],
    });
    expect(sessionStorage.getItem('onboarding-draft')).toBeNull();
  });

  it('asks for details when the baby reacted before, and sends them', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      signedIn(),
      children([]),
      http.post(`${API}/children`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(childFixture(), { status: 201 });
      }),
    );
    const { router } = renderApp('/onboarding/1');
    await stepOne();
    await stepTwo();
    await userEvent.click(
      await screen.findByRole('radio', { name: 'Có — tôi sẽ ghi lại chi tiết' }),
    );
    await next();
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/4'));
    await userEvent.type(
      screen.getByLabelText('Bé đã phản ứng thế nào, với thực phẩm gì?'),
      'Mẩn đỏ sau khi ăn trứng',
    );
    await next();
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ' }));
    await waitFor(() => expect(body.priorReactionNote).toBe('Mẩn đỏ sau khi ăn trứng'));
    expect(body.priorReaction).toBe('yes');
  });

  it('points back to the step to fix when the server refuses the profile', async () => {
    server.use(
      signedIn(),
      children([]),
      http.post(`${API}/children`, () => problem(422, 'CHILD_TOO_OLD', 'x')),
    );
    const { router } = renderApp('/onboarding/1');
    await stepOne();
    await stepTwo('2024-01-01');
    await next();
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ứng dụng hỗ trợ bé từ 6 đến 24 tháng tuổi',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Sửa thông tin' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/2'));
  });
});
