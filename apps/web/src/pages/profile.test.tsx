import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, me, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { NA_ID, childFixture } from '../test/fixtures';
import { server } from '../test/server';

describe('child profile (G03)', () => {
  it('shows the child, the stage and what is avoided, with links to the settings', async () => {
    server.use(signedIn());
    renderApp('/profile');
    expect(await screen.findByRole('heading', { level: 1, name: 'Na' })).toBeInTheDocument();
    expect(await screen.findByText('8 tháng 12 ngày · Giai đoạn 2 · Lợn cợn')).toBeInTheDocument();
    expect(screen.getByText('Trứng')).toBeInTheDocument();
    expect(screen.getByText('Mướp đắng · không thích')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Độ tuổi & giai đoạn/ })).toHaveAttribute(
      'href',
      '/settings/age',
    );
    expect(screen.getByRole('link', { name: /Tài khoản/ })).toHaveAttribute('href', '/account');
  });

  it('shows the stage number while the stage details are still loading', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/stages`, () => new Promise(() => {})),
    );
    renderApp('/profile');
    expect(await screen.findByText('8 tháng 12 ngày · Giai đoạn 2')).toBeInTheDocument();
  });

  it('shows an empty avoid list plainly', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children`, () =>
        HttpResponse.json([childFixture({ avoidAllergens: [], avoidIngredients: [] })]),
      ),
    );
    renderApp('/profile');
    expect(await screen.findByText('Chưa có thực phẩm cần tránh')).toBeInTheDocument();
  });

  it('shows a child that cannot be planned yet', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children`, () =>
        HttpResponse.json([
          childFixture({
            age: { months: 4, days: 0, corrected: false },
            effectiveStage: null,
            plannable: false,
          }),
        ]),
      ),
    );
    renderApp('/profile');
    expect(await screen.findByText('4 tháng · Chưa đến tuổi ăn dặm')).toBeInTheDocument();
  });

  it('UC-02 edits the avoid list and saves it', async () => {
    let body: unknown;
    server.use(
      signedIn(),
      http.put(`${API}/children/${NA_ID}/avoid-list`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(childFixture({ avoidAllergens: ['egg', 'fish'] }));
      }),
    );
    renderApp('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa thực phẩm cần tránh' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(body).toEqual({
        allergens: ['egg', 'fish'],
        ingredients: [{ ingredientId: 'ing_muop_dang', reason: 'dislike' }],
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Sửa thực phẩm cần tránh' }),
    ).toBeInTheDocument();
  });

  it('cancels editing without saving', async () => {
    const saved = vi.fn();
    server.use(
      signedIn(),
      http.put(
        `${API}/children/${NA_ID}/avoid-list`,
        () => (saved(), HttpResponse.json(childFixture())),
      ),
    );
    renderApp('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa thực phẩm cần tránh' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(saved).not.toHaveBeenCalled();
    expect(screen.queryByText('Cá')).toBeNull();
  });

  it('reports a failed save of the avoid list', async () => {
    server.use(
      signedIn(),
      http.put(`${API}/children/${NA_ID}/avoid-list`, () => problem(422, 'UNKNOWN_INGREDIENT')),
    );
    renderApp('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa thực phẩm cần tránh' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Có nguyên liệu không còn trong danh mục',
    );
  });

  it('NFR-019 deletes the child only after a second confirmation', async () => {
    const deleted = vi.fn();
    let list = [childFixture()];
    server.use(
      signedIn(),
      http.get(`${API}/children`, () => HttpResponse.json(list)),
      http.delete(`${API}/children/${NA_ID}`, () => {
        deleted();
        list = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Xóa dữ liệu của bé' }));
    expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Toàn bộ hồ sơ, thực đơn và nhật ký của Na sẽ bị xóa vĩnh viễn',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Xóa dữ liệu của bé' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xóa vĩnh viễn' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/1'));
    expect(deleted).toHaveBeenCalledOnce();
  });

  it('reports a failed deletion', async () => {
    server.use(
      signedIn(),
      http.delete(`${API}/children/${NA_ID}`, () => HttpResponse.error()),
    );
    renderApp('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Xóa dữ liệu của bé' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xóa vĩnh viễn' }));
    expect(
      await screen.findByText('Không kết nối được máy chủ. Kiểm tra kết nối mạng của bạn.'),
    ).toBeInTheDocument();
  });
});

describe('account (G12, UC-19)', () => {
  it('shows who is signed in and signs out', async () => {
    const logout = vi.fn();
    server.use(
      signedIn(),
      me('na@example.vn'),
      http.post(`${API}/auth/logout`, () => (logout(), new HttpResponse(null, { status: 204 }))),
    );
    const { router } = renderApp('/account');
    expect(await screen.findByText('na@example.vn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('signs out locally even if the server call fails', async () => {
    server.use(
      signedIn(),
      me(),
      http.post(`${API}/auth/logout`, () => HttpResponse.error()),
    );
    const { router } = renderApp('/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('TC-AUTH-021 needs the password to delete the account', async () => {
    server.use(
      signedIn(),
      me(),
      http.delete(`${API}/me`, () => problem(401, 'INVALID_CREDENTIALS')),
    );
    renderApp('/account');
    await userEvent.type(
      await screen.findByLabelText('Nhập mật khẩu để xác nhận'),
      'wrong password',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Nhập mật khẩu để xác nhận')).toHaveAccessibleDescription(
        /không đúng/,
      ),
    );
  });

  it('refuses to send an empty password', async () => {
    const deleted = vi.fn();
    server.use(
      signedIn(),
      me(),
      http.delete(`${API}/me`, () => (deleted(), new HttpResponse(null, { status: 204 }))),
    );
    renderApp('/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Xóa tài khoản' }));
    expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nhập mật khẩu để xác nhận')).toHaveAccessibleDescription(
      /Nhập mật khẩu/,
    );
  });

  it('TC-AUTH-022 deletes the account and returns to login', async () => {
    let body: unknown;
    server.use(
      signedIn(),
      me(),
      http.delete(`${API}/me`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp('/account');
    await userEvent.type(
      await screen.findByLabelText('Nhập mật khẩu để xác nhận'),
      'Cháo cá hồi 2026',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(body).toEqual({ password: 'Cháo cá hồi 2026' });
  });

  it('shows other deletion failures as a banner', async () => {
    server.use(
      signedIn(),
      me(),
      http.delete(`${API}/me`, () => HttpResponse.error()),
    );
    renderApp('/account');
    await userEvent.type(await screen.findByLabelText('Nhập mật khẩu để xác nhận'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });
});
