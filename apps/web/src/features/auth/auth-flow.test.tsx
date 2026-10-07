import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, problem, session, signedIn, signedOut } from '../../test/api';
import { renderApp } from '../../test/app';
import { server } from '../../test/server';
import { CONSENT_VERSION } from './consent';

describe('routing guards', () => {
  it('shows a loading state while the session is being restored', () => {
    server.use(http.post(`${API}/auth/refresh`, () => new Promise(() => {})));
    renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…');
  });

  it('sends a signed-out visitor to the login page and remembers where they wanted to go', async () => {
    server.use(signedOut());
    const { router } = renderApp('/week?start=2026-09-21');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(
      `?next=${encodeURIComponent('/week?start=2026-09-21')}`,
    );
  });

  it('restores the session from the refresh cookie and opens the requested page', async () => {
    server.use(signedIn());
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
  });

  it('sends a signed-in user away from the login page', async () => {
    server.use(signedIn());
    const { router } = renderApp('/login?next=%2Fweek');
    await waitFor(() => expect(router.state.location.pathname).toBe('/week'));
  });

  it('ignores an external next= target (open redirect)', async () => {
    server.use(signedIn());
    const { router } = renderApp('/login?next=https%3A%2F%2Fevil.test');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('TC-UI-015 returns to login when the session expires during use', async () => {
    let refreshed = false;
    server.use(
      http.post(`${API}/auth/refresh`, () => {
        if (refreshed) return problem(401, 'INVALID_REFRESH_TOKEN');
        refreshed = true;
        return HttpResponse.json(session());
      }),
      http.get(`${API}/me`, () => problem(401, 'UNAUTHENTICATED')),
    );
    const { router } = renderApp('/account');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Faccount');
  });

  it('TC-UI-017 shows a not-found page with a way home', async () => {
    server.use(signedIn());
    renderApp('/meals/khong-ton-tai/log/xyz');
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang Hôm nay' })).toHaveAttribute('href', '/');
  });

  it('keeps the privacy policy and server status public', async () => {
    server.use(
      signedOut(),
      http.get(`${API}/health`, () =>
        HttpResponse.json({ status: 'ok', checks: { database: 'up' } }),
      ),
    );
    renderApp('/privacy');
    expect(
      await screen.findByRole('heading', { name: 'Chính sách xử lý dữ liệu' }),
    ).toBeInTheDocument();
  });

  it('renders the server status page without signing in', async () => {
    server.use(
      signedOut(),
      http.get(`${API}/health`, () =>
        HttpResponse.json({ status: 'ok', checks: { database: 'up' } }),
      ),
    );
    renderApp('/status');
    expect(await screen.findByText('Máy chủ hoạt động bình thường')).toBeInTheDocument();
  });
});

describe('login', () => {
  async function fill(email: string, password: string) {
    await userEvent.type(await screen.findByLabelText('Email'), email);
    await userEvent.type(screen.getByLabelText('Mật khẩu'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  }

  it('signs in and continues to the remembered page', async () => {
    let body: unknown;
    server.use(
      signedOut(),
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(session());
      }),
    );
    const { router } = renderApp('/login?next=%2Fweek');
    await fill('na@example.vn', 'Cháo cá hồi 2026');
    await waitFor(() => expect(router.state.location.pathname).toBe('/week'));
    expect(body).toEqual({ email: 'na@example.vn', password: 'Cháo cá hồi 2026' });
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'Email hoặc mật khẩu không đúng'],
    ['TOO_MANY_ATTEMPTS', 429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.'],
    ['TOO_MANY_REQUESTS', 429, 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.'],
  ])('explains %s and keeps what was typed', async (code, status, message) => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/login`, () => problem(status, code)),
    );
    renderApp('/login');
    await fill('na@example.vn', 'wrong password');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Email')).toHaveValue('na@example.vn');
  });

  it('TC-UI-019 tells the user when the network is down', async () => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/login`, () => HttpResponse.error()),
    );
    renderApp('/login');
    await fill('na@example.vn', 'Cháo cá hồi 2026');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });

  it('can reveal and hide the password', async () => {
    server.use(signedOut());
    renderApp('/login');
    const password = await screen.findByLabelText('Mật khẩu');
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(password).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('links to registration and password recovery', async () => {
    server.use(signedOut());
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});

describe('registration (UC-18, G11)', () => {
  async function fill(email = 'na@example.vn', password = 'Cháo cá hồi 2026') {
    await userEvent.type(await screen.findByLabelText('Email'), email);
    await userEvent.type(screen.getByLabelText('Mật khẩu'), password);
  }

  it('requires consent before sending anything', async () => {
    const calls = vi.fn();
    server.use(
      signedOut(),
      http.post(`${API}/auth/register`, () => (calls(), HttpResponse.json(session()))),
    );
    renderApp('/register');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(
      await screen.findByText('Cần đồng ý với chính sách xử lý dữ liệu để tiếp tục'),
    ).toBeInTheDocument();
    expect(calls).not.toHaveBeenCalled();
  });

  it('summarises the data processing and links the full policy', async () => {
    server.use(signedOut());
    renderApp('/register');
    const consent = await screen.findByRole('group', { name: 'Dữ liệu của bé' });
    expect(within(consent).getByText(/dữ liệu sức khỏe/i)).toBeInTheDocument();
    expect(within(consent).getByRole('link', { name: 'Đọc chính sách đầy đủ' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('creates the account with the current consent version and signs in', async () => {
    let body: unknown;
    server.use(
      signedOut(),
      http.post(`${API}/auth/register`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(session(), { status: 201 });
      }),
    );
    const { router } = renderApp('/register');
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(body).toEqual({
      email: 'na@example.vn',
      password: 'Cháo cá hồi 2026',
      consentVersion: CONSENT_VERSION,
    });
  });

  it.each([
    ['EMAIL_TAKEN', 409, 'Email', 'Email đã được đăng ký. Hãy đăng nhập.'],
    ['INVALID_EMAIL', 400, 'Email', 'Email không hợp lệ'],
    ['PASSWORD_TOO_SHORT', 400, 'Mật khẩu', 'Mật khẩu cần ít nhất 8 ký tự'],
    ['PASSWORD_TOO_LONG', 400, 'Mật khẩu', 'Mật khẩu tối đa 128 ký tự'],
    ['WEAK_PASSWORD', 422, 'Mật khẩu', 'Mật khẩu quá phổ biến, hãy chọn mật khẩu khác'],
  ])('shows %s next to the %s field', async (code, status, field, message) => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/register`, () => problem(status, code)),
    );
    renderApp('/register');
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() =>
      expect(screen.getByLabelText(field)).toHaveAccessibleDescription(new RegExp(message)),
    );
  });

  it('asks to accept a newer policy when the server says the consent is outdated', async () => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/register`, () => problem(422, 'CONSENT_REQUIRED')),
    );
    renderApp('/register');
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(
      await screen.findByText(
        'Chính sách vừa được cập nhật. Vui lòng tải lại trang và đồng ý lại.',
      ),
    ).toBeInTheDocument();
  });

  it('shows other errors as a banner', async () => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/register`, () => HttpResponse.error()),
    );
    renderApp('/register');
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });
});

describe('password recovery', () => {
  it('TC-AUTH-018 always confirms, whatever the e-mail', async () => {
    let body: unknown;
    server.use(
      signedOut(),
      http.post(`${API}/auth/forgot-password`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );
    renderApp('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), 'na@example.vn');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nếu email này đã đăng ký');
    expect(body).toEqual({ email: 'na@example.vn' });
  });

  it('reports a failure to send', async () => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/forgot-password`, () => problem(429, 'TOO_MANY_REQUESTS')),
    );
    renderApp('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), 'na@example.vn');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn thao tác quá nhanh');
  });

  it('sets a new password from the e-mailed link', async () => {
    let body: unknown;
    server.use(
      signedOut(),
      http.post(`${API}/auth/reset-password`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/reset-password?token=abc123');
    await userEvent.type(await screen.findByLabelText('Mật khẩu mới'), 'Bột yến mạch chuối!');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã đổi mật khẩu');
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(body).toEqual({ token: 'abc123', newPassword: 'Bột yến mạch chuối!' });
  });

  it('explains an expired or used link and offers a new one', async () => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/reset-password`, () => problem(400, 'RESET_TOKEN_INVALID')),
    );
    renderApp('/reset-password?token=old');
    await userEvent.type(await screen.findByLabelText('Mật khẩu mới'), 'Bột yến mạch chuối!');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Liên kết không hợp lệ hoặc đã hết hạn',
    );
    expect(screen.getByRole('link', { name: 'Gửi liên kết mới' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows password rule errors on the field', async () => {
    server.use(
      signedOut(),
      http.post(`${API}/auth/reset-password`, () => problem(422, 'WEAK_PASSWORD')),
    );
    renderApp('/reset-password?token=abc');
    await userEvent.type(await screen.findByLabelText('Mật khẩu mới'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Mật khẩu mới')).toHaveAccessibleDescription(/quá phổ biến/),
    );
  });

  it('handles a link without a token', async () => {
    server.use(signedOut());
    renderApp('/reset-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Liên kết không hợp lệ hoặc đã hết hạn',
    );
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
  });
});

describe.each([
  ['/week', 'Thực đơn tuần'],
  ['/dishes', 'Món ăn'],
  ['/journal', 'Nhật ký'],
])('placeholder %s', (path, heading) => {
  it(`renders the ${heading} tab`, async () => {
    server.use(signedIn());
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });
});
