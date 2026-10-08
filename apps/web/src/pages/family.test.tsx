import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, children, me, problem, session, signedIn, signedOut } from '../test/api';
import { renderApp } from '../test/app';
import { CONSENT_VERSION } from '../features/auth/consent';
import { DAD_ID, NA_ID, childFixture, membersFixture } from '../test/fixtures';
import { server } from '../test/server';

const BIN_ID = '10000000-0000-4000-8000-000000000002';
const bin = () => childFixture({ id: BIN_ID, name: 'Bin', initials: 'Bi', role: 'caregiver' });

beforeEach(() => localStorage.clear());

describe('Choosing a child (G04, FR-117)', () => {
  it('shows no switcher with a single child', async () => {
    server.use(signedIn());
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đổi bé/ })).not.toBeInTheDocument();
  });

  it('switches child, remembers the choice, and falls back when that child is gone', async () => {
    server.use(signedIn(), children([childFixture(), bin()]));
    const user = userEvent.setup();
    const first = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Đổi bé, đang xem bé Na' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Chọn bé' }));
    expect(dialog.getByRole('button', { name: /Na/ })).toHaveAttribute('aria-current', 'true');
    expect(dialog.getByText(/Người chăm/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: /Bin/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Bin' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    first.unmount();

    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Bin' })).toBeInTheDocument();
    server.use(children([childFixture()]));
  });

  it('TC-FAM-023 shows the first child when the remembered one is no longer shared', async () => {
    localStorage.setItem('active-child', BIN_ID);
    server.use(signedIn(), children([childFixture()]));
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeInTheDocument();
  });

  it('closes the sheet with the close button, Escape or a tap outside', async () => {
    server.use(signedIn(), children([childFixture(), bin()]));
    const user = userEvent.setup();
    renderApp('/');
    const open = await screen.findByRole('button', { name: /Đổi bé/ });
    await user.click(open);
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(open);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(open);
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(open);
    await user.click(screen.getByRole('heading', { name: 'Chọn bé' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps working when the device storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    server.use(signedIn(), children([childFixture(), bin()]));
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Đổi bé/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Bin/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Bin' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('Members in the profile (G13)', () => {
  const card = async () =>
    within(await screen.findByRole('region', { name: 'Người cùng chăm bé' }));

  it('FR-113 lists members with their role; the owner sees pending links', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children/:childId/members`, () =>
        HttpResponse.json(
          membersFixture({
            pendingInvites: [
              {
                id: 'inv-1',
                createdAt: '2026-09-24T02:00:00.000Z',
                expiresAt: '2026-09-27T02:00:00.000Z',
              },
            ],
          }),
        ),
      ),
    );
    renderApp('/profile');
    const members = await card();
    expect(await members.findByText('Mẹ Na')).toBeInTheDocument();
    expect(members.getByText('· Bạn')).toBeInTheDocument();
    expect(members.getByText('Chủ hồ sơ · tham gia 1/9')).toBeInTheDocument();
    expect(members.getByText('Người chăm · tham gia 20/9')).toBeInTheDocument();
    expect(members.getByText('hết hạn 27/9')).toBeInTheDocument();
  });

  it('TC-FAM-001 the owner creates a link to share, with the warning and a copy button', async () => {
    let created = 0;
    server.use(
      signedIn(),
      http.post(`${API}/children/:childId/invites`, () => {
        created += 1;
        return HttpResponse.json(
          {
            id: 'inv-2',
            url: 'https://thucdon.test/invite/abc',
            expiresAt: '2026-09-27T02:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    // After setup: user-event installs its own clipboard.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Mời người chăm' }));
    const link = await members.findByLabelText('Link mời');
    expect(link).toHaveValue('https://thucdon.test/invite/abc');
    await user.click(link);
    expect((link as HTMLInputElement).selectionEnd).toBe('https://thucdon.test/invite/abc'.length);
    expect(members.getByText(/Ai có link đều tham gia được trong 72 giờ/)).toBeInTheDocument();
    await user.click(members.getByRole('button', { name: 'Sao chép link' }));
    expect(writeText).toHaveBeenCalledWith('https://thucdon.test/invite/abc');
    expect(await members.findByRole('button', { name: 'Đã sao chép' })).toBeInTheDocument();
    expect(created).toBe(1);
  });

  it('offers the phone share sheet when there is one; a failed copy says nothing', async () => {
    server.use(
      signedIn(),
      http.post(`${API}/children/:childId/invites`, () =>
        HttpResponse.json(
          {
            id: 'inv-2',
            url: 'https://thucdon.test/invite/abc',
            expiresAt: '2026-09-27T02:00:00.000Z',
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    const share = vi.fn().mockRejectedValue(new Error('cancelled'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Mời người chăm' }));
    await user.click(await members.findByRole('button', { name: 'Chia sẻ link' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Cùng chăm bé Na trên Thực đơn ăn dặm',
      url: 'https://thucdon.test/invite/abc',
    });
    await user.click(members.getByRole('button', { name: 'Sao chép link' }));
    expect(members.getByRole('button', { name: 'Sao chép link' })).toBeInTheDocument();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('shows a refused invite (limit reached)', async () => {
    server.use(
      signedIn(),
      http.post(`${API}/children/:childId/invites`, () => problem(422, 'INVITE_LIMIT_REACHED')),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Mời người chăm' }));
    expect(await members.findByText(/Đã có 5 lời mời đang chờ/)).toBeInTheDocument();
  });

  it('FR-114 revokes a pending link', async () => {
    let revoked = '';
    let pending = true;
    server.use(
      signedIn(),
      http.get(`${API}/children/:childId/members`, () =>
        HttpResponse.json(
          membersFixture({
            pendingInvites: pending
              ? [
                  {
                    id: 'inv-1',
                    createdAt: '2026-09-24T02:00:00.000Z',
                    expiresAt: '2026-09-27T02:00:00.000Z',
                  },
                ]
              : [],
          }),
        ),
      ),
      http.delete(`${API}/children/:childId/invites/:inviteId`, ({ params }) => {
        revoked = params.inviteId as string;
        pending = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Thu hồi lời mời hết hạn 27/9' }));
    await waitFor(() => expect(revoked).toBe('inv-1'));
    await waitFor(() => expect(members.queryByText('hết hạn 27/9')).not.toBeInTheDocument());
  });

  it('a failed revoke keeps the link listed', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children/:childId/members`, () =>
        HttpResponse.json(
          membersFixture({
            pendingInvites: [
              {
                id: 'inv-1',
                createdAt: '2026-09-24T02:00:00.000Z',
                expiresAt: '2026-09-27T02:00:00.000Z',
              },
            ],
          }),
        ),
      ),
      http.delete(`${API}/children/:childId/invites/:inviteId`, () =>
        problem(404, 'INVITE_NOT_FOUND'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: /Thu hồi lời mời/ }));
    expect(await members.findByText('Lời mời không còn.')).toBeInTheDocument();
  });

  it('TC-FAM-016 hands over and removes only after a second confirmation', async () => {
    const calls: string[] = [];
    server.use(
      signedIn(),
      http.post(`${API}/children/:childId/transfer-ownership`, async ({ request }) => {
        calls.push(`owner:${((await request.json()) as { userId: string }).userId}`);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${API}/children/:childId/members/:userId`, ({ params }) => {
        calls.push(`remove:${params.userId as string}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Chuyển quyền chủ cho Ba' }));
    expect(members.getByText(/Bạn sẽ thành người chăm/)).toBeInTheDocument();
    await user.click(members.getByRole('button', { name: 'Hủy' }));
    expect(calls).toEqual([]);
    await user.click(members.getByRole('button', { name: 'Chuyển quyền chủ cho Ba' }));
    await user.click(members.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(calls).toEqual([`owner:${DAD_ID}`]));
    await user.click(members.getByRole('button', { name: 'Gỡ Ba' }));
    expect(members.getByText(/Gỡ Ba\? Người này/)).toBeInTheDocument();
    await user.click(members.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(calls).toEqual([`owner:${DAD_ID}`, `remove:${DAD_ID}`]));
  });

  it('shows a refused removal', async () => {
    server.use(
      signedIn(),
      http.delete(`${API}/children/:childId/members/:userId`, () =>
        problem(404, 'MEMBER_NOT_FOUND'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Gỡ Ba' }));
    await user.click(members.getByRole('button', { name: 'Xác nhận' }));
    expect(await members.findByText('Người này không còn trong hồ sơ bé.')).toBeInTheDocument();
  });

  it('TC-FAM-015 / TC-FAM-028 a caregiver sees no owner controls and may leave', async () => {
    const removed: string[] = [];
    server.use(
      signedIn(),
      children([childFixture({ role: 'caregiver' })]),
      http.get(`${API}/children/:childId/members`, () =>
        HttpResponse.json(
          membersFixture({
            members: membersFixture().members.map((m) => ({ ...m, isMe: m.role === 'caregiver' })),
          }),
        ),
      ),
      http.delete(`${API}/children/:childId/members/:userId`, ({ params }) => {
        removed.push(params.userId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    expect(await members.findByText(/Chỉ chủ hồ sơ sửa được/)).toBeInTheDocument();
    expect(members.queryByRole('button', { name: 'Mời người chăm' })).not.toBeInTheDocument();
    expect(members.queryByRole('button', { name: /Gỡ/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sửa thực phẩm cần tránh' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa dữ liệu của bé' })).not.toBeInTheDocument();
    await user.click(members.getByRole('button', { name: 'Rời hồ sơ bé' }));
    expect(members.getByText(/Rời hồ sơ của Na\?/)).toBeInTheDocument();
    await user.click(members.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(removed).toEqual([DAD_ID]));
  });

  it('retries loading the members', async () => {
    let attempts = 0;
    server.use(
      signedIn(),
      http.get(`${API}/children/:childId/members`, () =>
        ++attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(membersFixture()),
      ),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const members = await card();
    await user.click(await members.findByRole('button', { name: 'Thử lại' }));
    expect(await members.findByText('Mẹ Na')).toBeInTheDocument();
  });

  it('TC-FAM-028 a caregiver cannot resume a paused food nor save the stage', async () => {
    server.use(
      signedIn(),
      children([childFixture({ role: 'caregiver' })]),
      http.get(`${API}/children/:childId/paused-ingredients`, () =>
        HttpResponse.json([
          {
            id: 'p1',
            ingredientId: 'ing_rau_ngot',
            name: 'Rau ngót',
            reason: 'reaction',
            pausedAt: '2026-09-24T04:45:00.000Z',
            meal: null,
          },
        ]),
      ),
    );
    const first = renderApp('/profile');
    expect(await screen.findByText('Rau ngót')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Bác sĩ đã cho phép dùng lại/ }),
    ).not.toBeInTheDocument();
    first.unmount();
    renderApp('/settings/age');
    expect(await screen.findByText(/Bạn là người chăm/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lưu và cập nhật thực đơn' }),
    ).not.toBeInTheDocument();
  });
});

describe('Opening an invite (G14, UC-21)', () => {
  const PREVIEW = { childName: 'Na', inviterName: 'Mẹ Na', expiresAt: '2026-09-27T02:00:00.000Z' };

  function servePreview(reply: () => Response = () => HttpResponse.json(PREVIEW)) {
    server.use(http.get(`${API}/invites/:token`, reply));
  }

  it('TC-FAM-002 a visitor without an account sees the invite and goes to sign up, then comes back', async () => {
    servePreview();
    server.use(
      signedOut(),
      http.post(`${API}/auth/register`, () => HttpResponse.json(session(), { status: 201 })),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/invite/abc');
    expect(await screen.findByText('Mẹ Na mời bạn cùng chăm bé Na.')).toBeInTheDocument();
    expect(screen.getByText(/dữ liệu sức khỏe của trẻ/)).toBeInTheDocument();
    expect(screen.getByText('Lời mời hết hạn 09:00 27/9.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập để tham gia' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/invite/abc')}`,
    );
    await user.click(screen.getByRole('link', { name: 'Tạo tài khoản' }));
    await user.type(await screen.findByLabelText('Email'), 'ba@example.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Cháo cá hồi 2026');
    await user.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }));
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/invite/abc'));
    expect(await screen.findByRole('button', { name: 'Tham gia' })).toBeInTheDocument();
    expect(CONSENT_VERSION).toBeTruthy();
  });

  it('keeps the invite when moving between sign in and sign up', async () => {
    server.use(signedOut());
    const user = userEvent.setup();
    const { router } = renderApp(`/login?next=${encodeURIComponent('/invite/abc')}`);
    await user.click(await screen.findByRole('link', { name: 'Tạo tài khoản' }));
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/invite/abc')}`);
    await user.click(screen.getByRole('link', { name: 'Đăng nhập' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/invite/abc')}`);
  });

  it('TC-FAM-001 a signed-in parent joins and lands on the child', async () => {
    servePreview();
    let accepted = false;
    server.use(
      signedIn(),
      http.post(`${API}/invites/:token/accept`, ({ params }) => {
        expect(params.token).toBe('abc');
        accepted = true;
        return HttpResponse.json({ childId: BIN_ID, role: 'caregiver' });
      }),
      http.get(`${API}/children`, () =>
        HttpResponse.json(accepted ? [childFixture(), bin()] : [childFixture()]),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/invite/abc');
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Bin' })).toBeInTheDocument();
  });

  it('TC-FAM-008 a member opening a link of the same child simply opens it', async () => {
    servePreview();
    server.use(
      signedIn(),
      children([childFixture(), bin()]),
      http.post(`${API}/invites/:token/accept`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'x',
            status: 409,
            code: 'ALREADY_MEMBER',
            instance: '/x',
            childId: BIN_ID,
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/invite/abc');
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Bin' })).toBeInTheDocument();
  });

  it.each([
    ['INVITE_NOT_FOUND', 404, /Link mời không đúng/],
    ['INVITE_EXPIRED', 410, /Link mời đã hết hạn/],
    ['INVITE_REVOKED', 410, /Link mời đã bị thu hồi/],
    ['INVITE_USED', 409, /Link mời đã được dùng/],
  ])('TC-FAM-004..006 explains %s', async (code, status, message) => {
    servePreview(() => problem(status, code));
    server.use(signedOut());
    renderApp('/invite/abc');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang Hôm nay' })).toBeInTheDocument();
  });

  it('explains a link used by someone else between the preview and "Tham gia"', async () => {
    servePreview();
    server.use(
      signedIn(),
      http.post(`${API}/invites/:token/accept`, () => problem(409, 'INVITE_USED')),
    );
    const user = userEvent.setup();
    renderApp('/invite/abc');
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    expect(await screen.findByText(/Link mời đã được dùng/)).toBeInTheDocument();
  });

  it('shows other refusals, retries a failed preview, waits for the session', async () => {
    let attempts = 0;
    servePreview(() => (++attempts === 1 ? problem(500, 'INTERNAL') : HttpResponse.json(PREVIEW)));
    server.use(http.post(`${API}/auth/refresh`, () => new Promise(() => {})));
    const user = userEvent.setup();
    renderApp('/invite/abc');
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Mẹ Na mời bạn cùng chăm bé Na.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tham gia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đăng nhập để tham gia' })).not.toBeInTheDocument();
  });

  it('shows a member limit reached on joining', async () => {
    servePreview();
    server.use(
      signedIn(),
      http.post(`${API}/invites/:token/accept`, () => problem(422, 'MEMBER_LIMIT_REACHED')),
    );
    const user = userEvent.setup();
    renderApp('/invite/abc');
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    expect(await screen.findByText(/tối đa 6 người chăm/)).toBeInTheDocument();
  });
});

describe('Account (G12, FR-119, BR-76)', () => {
  it('saves the display name; a blank name clears it', async () => {
    const sent: unknown[] = [];
    server.use(
      signedIn(),
      http.get(`${API}/me`, () =>
        HttpResponse.json({
          id: 'u1',
          email: 'ba@example.vn',
          timezone: 'Asia/Ho_Chi_Minh',
          displayName: null,
          createdAt: '2026-09-28T03:00:00Z',
        }),
      ),
      http.patch(`${API}/me`, async ({ request }) => {
        const body = (await request.json()) as { displayName: string | null };
        sent.push(body);
        return HttpResponse.json({
          id: 'u1',
          email: 'ba@example.vn',
          timezone: 'Asia/Ho_Chi_Minh',
          displayName: body.displayName,
          createdAt: '2026-09-28T03:00:00Z',
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/account');
    const field = await screen.findByLabelText('Tên người nhà thấy');
    await user.type(field, ' Ba ');
    await user.click(screen.getByRole('button', { name: 'Lưu tên' }));
    expect(await screen.findByText('Đã lưu tên hiển thị.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, '   ');
    await user.click(screen.getByRole('button', { name: 'Lưu tên' }));
    await waitFor(() => expect(sent).toEqual([{ displayName: 'Ba' }, { displayName: null }]));
  });

  it('shows a refused display name', async () => {
    server.use(
      signedIn(),
      me(),
      http.patch(`${API}/me`, () => problem(400, 'INVALID_DISPLAY_NAME')),
    );
    const user = userEvent.setup();
    renderApp('/account');
    await user.type(await screen.findByLabelText('Tên người nhà thấy'), 'Ba');
    await user.click(screen.getByRole('button', { name: 'Lưu tên' }));
    expect(await screen.findByText('Tên hiển thị tối đa 30 ký tự.')).toBeInTheDocument();
  });

  it('TC-FAM-018 lists the children to hand over before the account can be deleted', async () => {
    server.use(
      signedIn(),
      http.delete(`${API}/me`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'x',
            status: 409,
            code: 'OWNERSHIP_TRANSFER_REQUIRED',
            instance: '/x',
            children: [{ id: NA_ID, name: 'Na' }],
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp('/account');
    await user.type(await screen.findByLabelText('Nhập mật khẩu để xác nhận'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Hãy chuyển quyền chủ hoặc xóa các hồ sơ bé sau');
    expect(within(alert).getByText('Na')).toBeInTheDocument();
    await act(async () => {});
  });
});
