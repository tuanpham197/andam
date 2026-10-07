import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { NA_ID, childFixture } from '../test/fixtures';
import { server } from '../test/server';

const corrected = childFixture({
  isPremature: true,
  weeksEarly: 3,
  age: { months: 7, days: 22, corrected: true },
  autoStage: 1,
  effectiveStage: 1,
  stages: [
    { id: 1, state: 'selected', unlockAtMonths: 6 },
    { id: 2, state: 'locked', unlockAtMonths: 8 },
    { id: 3, state: 'locked', unlockAtMonths: 10 },
    { id: 4, state: 'locked', unlockAtMonths: 12 },
  ],
});
const overridden = childFixture({
  effectiveStage: 1,
  isOverride: true,
  stages: [
    { id: 1, state: 'selected', unlockAtMonths: 6 },
    { id: 2, state: 'open', unlockAtMonths: 8 },
    { id: 3, state: 'locked', unlockAtMonths: 10 },
    { id: 4, state: 'locked', unlockAtMonths: 12 },
  ],
});

/** Preview answers from the query string, like the API would. */
function previewFromQuery() {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/children/${NA_ID}/stage-preview`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      calls.push(params);
      if (params.get('isPremature') === 'true') return HttpResponse.json(corrected);
      if (params.get('stage') === '1') return HttpResponse.json(overridden);
      return HttpResponse.json(childFixture());
    }),
  );
  return calls;
}

describe('age settings (S10, UC-03)', () => {
  it('shows the planning age, the 4 stages and what the menu will apply', async () => {
    server.use(signedIn());
    previewFromQuery();
    renderApp('/settings/age');
    expect(
      await screen.findByRole('heading', { name: 'Độ tuổi & giai đoạn ăn dặm' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ngày sinh')).toHaveValue('2026-01-12');
    expect(await screen.findByText('8 tháng 12 ngày')).toBeInTheDocument();

    const stages = screen.getByRole('group', { name: 'Giai đoạn' });
    expect(within(stages).getByRole('button', { name: /Giai đoạn 2 · 8–9 tháng/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(stages).getByRole('button', { name: /Giai đoạn 1 · 6–7 tháng/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      within(stages).getByRole('button', { name: /Giai đoạn 3 · 10–12 tháng/ }),
    ).toBeDisabled();
    expect(within(stages).getByText('Mở khi bé đủ 10 tháng')).toBeInTheDocument();
    expect(within(stages).getByText('Theo tuổi')).toBeInTheDocument();

    const applied = screen.getByRole('region', { name: 'Thực đơn sẽ áp dụng' });
    expect(within(applied).getByText('Lợn cợn')).toBeInTheDocument();
    expect(within(applied).getByText('Khoảng 125 ml')).toBeInTheDocument();
    expect(within(applied).getByText('3 bữa')).toBeInTheDocument();
    expect(within(applied).getByText('1 bữa')).toBeInTheDocument();
    expect(screen.getByText(/hướng dẫn WHO/)).toBeInTheDocument();
  });

  it('TC-AGE-002 previews the corrected age of a premature baby before saving', async () => {
    server.use(signedIn());
    const calls = previewFromQuery();
    renderApp('/settings/age');
    await userEvent.click(await screen.findByRole('switch', { name: 'Bé sinh non' }));
    const weeks = screen.getByLabelText('Sinh sớm bao nhiêu tuần?');
    await userEvent.clear(weeks);
    await userEvent.type(weeks, '3');
    expect(await screen.findByText('7 tháng 22 ngày (hiệu chỉnh)')).toBeInTheDocument();
    expect(calls.at(-1)!.get('weeksEarly')).toBe('3');
  });

  it('says the preview is updating while a slow response is on its way, then shows it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      signedIn(),
      http.get(`${API}/children`, () => HttpResponse.json([corrected])),
      http.get(`${API}/children/${NA_ID}/stage-preview`, async ({ request }) => {
        if (new URL(request.url).searchParams.get('isPremature') === 'false') {
          await gate;
          return HttpResponse.json(childFixture());
        }
        return HttpResponse.json(corrected);
      }),
    );
    renderApp('/settings/age');
    expect(await screen.findByText('7 tháng 22 ngày (hiệu chỉnh)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Bé sinh non' }));
    expect(await screen.findByText('Đang cập nhật…')).toBeInTheDocument();
    release();
    expect(await screen.findByText('8 tháng 12 ngày')).toBeInTheDocument();
    expect(screen.queryByText('Đang cập nhật…')).toBeNull();
  });

  it('TC-STG-001 lets the parent keep an earlier stage, warns, and offers to return to the age', async () => {
    server.use(signedIn());
    previewFromQuery();
    renderApp('/settings/age');
    await userEvent.click(await screen.findByRole('button', { name: /Giai đoạn 1 · 6–7 tháng/ }));
    expect(await screen.findByText(/đang giữ giai đoạn sớm hơn tuổi của bé/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Về theo tuổi' }));
    await waitFor(() => expect(screen.queryByText(/đang giữ giai đoạn sớm hơn tuổi/)).toBeNull());
  });

  it('saves and goes back to Today', async () => {
    let body: unknown;
    server.use(
      signedIn(),
      http.patch(`${API}/children/${NA_ID}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(overridden);
      }),
    );
    previewFromQuery();
    const { router } = renderApp('/settings/age');
    await userEvent.click(await screen.findByRole('button', { name: /Giai đoạn 1 · 6–7 tháng/ }));
    await screen.findByText(/đang giữ giai đoạn sớm hơn tuổi/);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu và cập nhật thực đơn' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(body).toEqual({
      birthDate: '2026-01-12',
      isPremature: false,
      weeksEarly: 0,
      stageOverride: 1,
    });
  });

  it('explains when the baby is still under 6 months', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children/${NA_ID}/stage-preview`, () =>
        HttpResponse.json(
          childFixture({
            age: { months: 4, days: 3, corrected: false },
            autoStage: null,
            effectiveStage: null,
            plannable: false,
            notPlannableReason: 'too_young',
            stages: [1, 2, 3, 4].map((id) => ({
              id,
              state: 'locked' as const,
              unlockAtMonths: [6, 8, 10, 12][id - 1]!,
            })),
          }),
        ),
      ),
    );
    renderApp('/settings/age');
    expect(
      await screen.findByText('Dưới 6 tháng, ứng dụng chưa lập thực đơn ăn dặm.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Thực đơn sẽ áp dụng' })).toBeNull();
  });

  it('shows a preview error from the API next to the birth fields', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children/${NA_ID}/stage-preview`, ({ request }) =>
        new URL(request.url).searchParams.get('birthDate') === '2024-01-01'
          ? problem(422, 'CHILD_TOO_OLD')
          : HttpResponse.json(childFixture()),
      ),
    );
    renderApp('/settings/age');
    fireEvent.change(await screen.findByLabelText('Ngày sinh'), {
      target: { value: '2024-01-01' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ứng dụng hỗ trợ bé từ 6 đến 24 tháng tuổi',
    );
    expect(screen.getByRole('button', { name: 'Lưu và cập nhật thực đơn' })).toBeDisabled();
  });

  it('reports a failed save', async () => {
    server.use(
      signedIn(),
      http.patch(`${API}/children/${NA_ID}`, () => problem(422, 'STAGE_ABOVE_AGE')),
    );
    previewFromQuery();
    renderApp('/settings/age');
    await screen.findByText('8 tháng 12 ngày');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu và cập nhật thực đơn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể chọn giai đoạn cao hơn tuổi của bé',
    );
  });
});
