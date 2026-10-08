import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { LUNCH_ID, NA_ID, URGENT_ID, urgentFixture } from '../test/fixtures';
import { server } from '../test/server';

/** Records each "open" request body and answers with `reply`. */
function serveOpen(
  reply: () => Response | Promise<Response> = () =>
    HttpResponse.json(urgentFixture(), { status: 201 }),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/children/:childId/urgent-events`, async ({ params, request }) => {
      expect(params.childId).toBe(NA_ID);
      bodies.push(await request.json());
      return reply();
    }),
  );
  return bodies;
}

const title = () =>
  screen.findByRole('heading', {
    level: 1,
    name: 'Gọi cấp cứu ngay nếu bé có một trong các dấu hiệu sau',
  });

beforeEach(() => server.use(signedIn()));

describe('Danger signs (S08)', () => {
  it('TC-URG-005 shows the 4 signs and a tel:115 button with the number as text', async () => {
    serveOpen();
    renderApp(`/urgent?mealId=${LUNCH_ID}`);
    await title();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Khó thở, thở rít hoặc ho liên tục',
      'Sưng môi, lưỡi hoặc mặt',
      'Nôn nhiều lần liên tiếp',
      'Lừ đừ, khó đánh thức, tím tái',
    ]);
    const call = screen.getByRole('link', { name: 'Gọi 115' });
    expect(call).toHaveAttribute('href', 'tel:115');
    expect(call).toHaveTextContent('115');
    expect(screen.getByText(/không chẩn đoán/)).toBeInTheDocument();
  });

  it('TC-URG-001 records the event once and names the foods it paused', async () => {
    const bodies = serveOpen();
    renderApp(`/urgent?mealId=${LUNCH_ID}`);
    expect(await screen.findByText('Đã tạm dừng gợi ý liên quan')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cá hồi và rau ngót sẽ không xuất hiện trong thực đơn cho đến khi bạn xác nhận lại sau khi hỏi ý kiến bác sĩ.',
      ),
    ).toBeInTheDocument();
    expect(bodies).toEqual([{ mealId: LUNCH_ID }]);
  });

  it('TC-URG-002 without a meal sends no meal and shows no paused foods', async () => {
    const bodies = serveOpen(() =>
      HttpResponse.json(urgentFixture({ mealId: null, pausedIngredients: [] }), { status: 201 }),
    );
    renderApp('/urgent');
    await title();
    await waitFor(() => expect(bodies).toEqual([{ mealId: null }]));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tôi đã liên hệ nhân viên y tế' })).toBeEnabled(),
    );
    expect(screen.queryByText('Đã tạm dừng gợi ý liên quan')).not.toBeInTheDocument();
  });

  it('shows the signs and the call button while the event is being recorded', async () => {
    serveOpen(async () => {
      await delay('infinite');
      return HttpResponse.json(urgentFixture());
    });
    renderApp(`/urgent?mealId=${LUNCH_ID}`);
    await title();
    expect(screen.getByRole('link', { name: 'Gọi 115' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tạm dừng gợi ý liên quan…');
    expect(screen.getByRole('button', { name: 'Tôi đã liên hệ nhân viên y tế' })).toBeDisabled();
  });

  it('FR-067 records "đã liên hệ y tế" with its time', async () => {
    serveOpen();
    server.use(
      http.patch(`${API}/urgent-events/:eventId`, async ({ params, request }) => {
        expect(params.eventId).toBe(URGENT_ID);
        expect(await request.json()).toEqual({ contactedMedical: true });
        return HttpResponse.json(urgentFixture({ contactedMedicalAt: '2026-09-24T04:48:00.000Z' }));
      }),
    );
    const user = userEvent.setup();
    renderApp(`/urgent?mealId=${LUNCH_ID}`);
    const button = await screen.findByRole('button', { name: 'Tôi đã liên hệ nhân viên y tế' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByText('Đã ghi nhận liên hệ y tế lúc 11:48')).toBeInTheDocument();
    // Still shows what was paused when the event opened.
    expect(screen.getByText('Đã tạm dừng gợi ý liên quan')).toBeInTheDocument();
  });

  it('when recording fails, the call button stays and the parent can try again', async () => {
    let attempts = 0;
    serveOpen(() =>
      ++attempts === 1
        ? problem(500, 'INTERNAL')
        : HttpResponse.json(urgentFixture(), { status: 201 }),
    );
    const user = userEvent.setup();
    renderApp(`/urgent?mealId=${LUNCH_ID}`);
    expect(
      await screen.findByText('Chưa ghi nhận được. Bạn vẫn có thể gọi 115 ngay.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi 115' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử ghi nhận lại' }));
    expect(await screen.findByText('Đã tạm dừng gợi ý liên quan')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('goes back to the previous screen, or to today after a deep link', async () => {
    serveOpen();
    const user = userEvent.setup();
    const { router } = renderApp('/urgent');
    await title();
    await user.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await act(() => router.navigate('/urgent'));
    await title();
    await user.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
