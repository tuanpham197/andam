import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { NA_ID, healthFixture, urgentFixture } from '../test/fixtures';
import { server } from '../test/server';

// 09:40 in Hà Nội on Thursday 24 September 2026.
const NOW = new Date('2026-09-24T02:40:00Z');

const title = () => screen.findByRole('heading', { level: 1, name: 'Hôm nay bé Na thế nào?' });
/** The form shows once the current status is known. */
const form = async () => {
  await title();
  return screen.findByRole('group', { name: 'Trạng thái sức khỏe' });
};
const changes = () =>
  within(screen.getByRole('region', { name: 'Thực đơn sẽ thay đổi' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

function recordUpdates(status = 200) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/children/:childId/health`, async ({ params, request }) => {
      expect(params.childId).toBe(NA_ID);
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      if (status !== 200) return problem(status, 'HEALTH_START_TOO_FAR');
      return HttpResponse.json(healthFixture({ status: body.status as 'sick' }));
    }),
  );
  return bodies;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  server.use(signedIn());
});
afterEach(() => vi.useRealTimers());

describe('Health (S09, UC-11)', () => {
  it('starts from the current status and says what the menu does (FR-083)', async () => {
    renderApp('/health');
    const statuses = within(await form());
    expect(statuses.getByRole('radio', { name: /Bình thường/ })).toBeChecked();
    expect(statuses.getByText('Món mềm, lỏng, dễ ăn; chia nhỏ bữa')).toBeInTheDocument();
    await waitFor(() =>
      expect(changes()).toEqual([
        'Thực đơn đầy đủ theo độ tuổi',
        'Tiếp tục cho bé làm quen thực phẩm mới',
      ]),
    );
    expect(screen.queryByRole('group', { name: 'Bạn thấy bé có biểu hiện gì?' })).toBeNull();
  });

  it('TC-HLT-001 "Đang ốm": symptoms, dates and the design’s three changes', async () => {
    const user = userEvent.setup();
    renderApp('/health');
    await form();
    await user.click(screen.getByRole('radio', { name: /Đang ốm/ }));
    const symptoms = within(screen.getByRole('group', { name: 'Bạn thấy bé có biểu hiện gì?' }));
    expect(symptoms.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Sốt',
      'Biếng ăn',
      'Ho, sổ mũi',
      'Tiêu chảy',
      'Nôn',
      'Mọc răng',
    ]);
    expect(screen.getByLabelText('Bắt đầu')).toHaveValue('2026-09-24');
    expect(screen.getByLabelText('Dự kiến kết thúc')).toHaveValue('');
    await waitFor(() =>
      expect(changes()).toEqual([
        'Chia nhỏ thành nhiều bữa, lượng mỗi bữa ít hơn',
        'Ưu tiên món mềm, lỏng hơn một mức kết cấu',
        'Tạm ngưng thử nguyên liệu mới',
      ]),
    );
  });

  it('describes recovery: smaller portions at the stage texture, still no new foods', async () => {
    const user = userEvent.setup();
    renderApp('/health');
    await form();
    await user.click(screen.getByRole('radio', { name: /Đang hồi phục/ }));
    await waitFor(() =>
      expect(changes()).toEqual([
        'Lượng mỗi bữa khoảng 85% so với bình thường',
        'Kết cấu theo giai đoạn của bé',
        'Tạm ngưng thử nguyên liệu mới',
      ]),
    );
  });

  it('FR-084 saves the status, then goes back to today with fresh data', async () => {
    const bodies = recordUpdates();
    const user = userEvent.setup();
    const { router } = renderApp('/health');
    await form();
    await user.click(screen.getByRole('radio', { name: /Đang ốm/ }));
    await user.click(screen.getByRole('button', { name: 'Sốt' }));
    await user.click(screen.getByRole('button', { name: 'Biếng ăn' }));
    await user.click(screen.getByRole('button', { name: 'Sốt' }));
    fireEvent.change(screen.getByLabelText('Dự kiến kết thúc'), {
      target: { value: '2026-09-26' },
    });
    await user.click(screen.getByRole('button', { name: 'Cập nhật thực đơn' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(bodies).toEqual([
      {
        status: 'sick',
        symptoms: ['poor_appetite'],
        startDate: '2026-09-24',
        expectedEndDate: '2026-09-26',
      },
    ]);
  });

  it('TC-HLT-007 back to "Bình thường" sends no symptoms, whatever was filled in', async () => {
    server.use(
      http.get(`${API}/children/:childId/health`, () =>
        HttpResponse.json(
          healthFixture({
            status: 'sick',
            symptoms: ['fever'],
            startDate: '2026-09-22',
            expectedEndDate: null,
          }),
        ),
      ),
    );
    const bodies = recordUpdates();
    const user = userEvent.setup();
    renderApp('/health');
    await form();
    expect(screen.getByRole('radio', { name: /Đang ốm/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Sốt' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Bắt đầu')).toHaveValue('2026-09-22');
    await user.click(screen.getByRole('radio', { name: /Bình thường/ }));
    await user.click(screen.getByRole('button', { name: 'Cập nhật thực đơn' }));
    await waitFor(() => expect(bodies).toEqual([{ status: 'normal', symptoms: [] }]));
  });

  it('TC-HLT-005 blocks an expected end before the start', async () => {
    const user = userEvent.setup();
    renderApp('/health');
    await form();
    await user.click(screen.getByRole('radio', { name: /Đang ốm/ }));
    fireEvent.change(screen.getByLabelText('Dự kiến kết thúc'), {
      target: { value: '2026-09-23' },
    });
    expect(screen.getByText('Ngày kết thúc phải từ ngày bắt đầu trở đi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cập nhật thực đơn' })).toBeDisabled();
  });

  it('shows why the server refused, and stays on the screen', async () => {
    recordUpdates(422);
    const user = userEvent.setup();
    const { router } = renderApp('/health');
    await form();
    await user.click(screen.getByRole('radio', { name: /Đang ốm/ }));
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2026-10-05' } });
    await user.click(screen.getByRole('button', { name: 'Cập nhật thực đơn' }));
    expect(
      await screen.findByText('Ngày bắt đầu chỉ được trong vòng 7 ngày tới.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/health');
  });

  it('links to the danger signs (S08), which lead back here', async () => {
    server.use(
      http.post(`${API}/children/:childId/urgent-events`, () =>
        HttpResponse.json(urgentFixture({ mealId: null, pausedIngredients: [] }), { status: 201 }),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/health');
    await form();
    expect(screen.getByText(/Ứng dụng không chẩn đoán bệnh/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Xem dấu hiệu nguy hiểm' }));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Gọi cấp cứu ngay nếu bé có một trong các dấu hiệu sau',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/health'));
  });

  it('offers a retry when the status or the preview cannot be loaded', async () => {
    server.use(
      http.get(`${API}/children/:childId/health`, () => problem(500, 'INTERNAL')),
      http.get(`${API}/children/:childId/health/preview`, () => problem(500, 'INTERNAL')),
    );
    renderApp('/health');
    await title();
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    server.use(
      http.get(`${API}/children/:childId/health`, () => HttpResponse.json(healthFixture())),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    const region = await screen.findByRole('region', { name: 'Thực đơn sẽ thay đổi' });
    server.use(
      http.get(`${API}/children/:childId/health/preview`, () =>
        HttpResponse.json({
          status: 'normal',
          extraSnacks: 0,
          portionPercent: 100,
          softerTexture: 0,
          pauseNewFoods: false,
        }),
      ),
    );
    await userEvent.setup().click(await within(region).findByRole('button', { name: 'Thử lại' }));
    expect(await within(region).findByText('Thực đơn đầy đủ theo độ tuổi')).toBeInTheDocument();
  });
});
