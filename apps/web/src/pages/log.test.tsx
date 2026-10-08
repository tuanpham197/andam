import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { LogFormDto, LogMealDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { LUNCH_ID, logFormFixture, loggedFixture } from '../test/fixtures';
import { server } from '../test/server';

const LOG_URL = `/meals/${LUNCH_ID}/log`;
// 11:40 in Vietnam on 24/09/2026.
const NOW = new Date('2026-09-24T04:40:00Z');

function serveForm(answer: () => LogFormDto | Response = () => logFormFixture()) {
  server.use(
    http.get(`${API}/meals/:mealId/log`, ({ params }) => {
      expect(params.mealId).toBe(LUNCH_ID);
      const body = answer();
      return body instanceof Response ? body : HttpResponse.json(body);
    }),
  );
}

/** Records every log sent and answers with `reply`. */
function serveLog(
  reply: () => Response = () => HttpResponse.json(loggedFixture(), { status: 201 }),
) {
  const sent: LogMealDto[] = [];
  server.use(
    http.post(`${API}/meals/:mealId/log`, async ({ request }) => {
      sent.push((await request.json()) as LogMealDto);
      return reply();
    }),
  );
  return sent;
}

/** The title shows at once; the meal arrives with the data. */
async function heading() {
  await screen.findByRole('heading', { level: 1, name: 'Bé đã ăn thế nào?' });
  await screen.findByText('Cháo cá hồi rau ngót');
}
const save = () => screen.getByRole('button', { name: 'Lưu ghi nhận' });

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Nửa phần' }));
  await user.click(screen.getByRole('button', { name: '3 trên 5' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  sessionStorage.clear();
  server.use(signedIn());
});
afterEach(() => vi.useRealTimers());

describe('Log a meal (S07)', () => {
  it('shows the meal, the 6 amounts and the 1–5 scale; saving waits for both', async () => {
    serveForm();
    renderApp(LOG_URL);
    await heading();
    expect(await screen.findByText('Trưa · 11:00')).toBeInTheDocument();
    expect(screen.getByText('Cháo cá hồi rau ngót')).toBeInTheDocument();
    const amounts = within(screen.getByRole('group', { name: 'Lượng bé ăn' }));
    expect(amounts.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Không ăn',
      'Vài thìa',
      '1/4 phần',
      'Nửa phần',
      'Gần hết',
      'Hết',
    ]);
    expect(screen.getByRole('group', { name: 'Bé có thích món này?' })).toBeInTheDocument();
    expect(screen.getByText('Từ chối')).toBeInTheDocument();
    expect(screen.getByLabelText('Giờ ghi nhận')).toHaveValue('11:40');
    expect(save()).toBeDisabled();
    expect(screen.getByText('Chọn lượng bé ăn và mức thích để lưu.')).toBeInTheDocument();
    expect(screen.getByText('rau ngót')).toBeInTheDocument();
    // No reaction yet: no severity, no note.
    expect(screen.queryByRole('group', { name: 'Mức độ bạn thấy' })).not.toBeInTheDocument();
  });

  it('TC-LOG-001 saves the log with the time in Vietnam and says it is done', async () => {
    serveForm();
    const sent = serveLog();
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    expect(screen.getByRole('button', { name: 'Nửa phần' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(save());
    expect(await screen.findByRole('heading', { name: 'Đã lưu ghi nhận' })).toBeInTheDocument();
    expect(sent).toEqual([
      { loggedAt: '2026-09-24T11:40:00+07:00', amount: 'half', liking: 3, reaction: null },
    ]);
    expect(sessionStorage.getItem(`log-draft:${LUNCH_ID}`)).toBeNull();
    expect(screen.getByRole('link', { name: 'Về trang Hôm nay' })).toHaveAttribute('href', '/');
  });

  it('TC-LOG-009 a reaction: severity, note, what will pause, and what was paused', async () => {
    serveForm();
    const sent = serveLog(() =>
      HttpResponse.json(
        loggedFixture({ pausedIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }] }),
        { status: 201 },
      ),
    );
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    await user.click(screen.getByRole('button', { name: 'Nổi mẩn đỏ' }));
    const severity = within(screen.getByRole('group', { name: 'Mức độ bạn thấy' }));
    expect(severity.getByRole('button', { name: 'Chưa rõ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(severity.getByRole('button', { name: 'Nhẹ' }));
    await user.type(screen.getByLabelText('Ghi chú'), 'Mẩn ở má');
    expect(screen.getByText('8/500')).toBeInTheDocument();
    expect(
      screen.getByText(/sẽ tạm không được gợi ý cho đến khi bạn xác nhận lại/),
    ).toHaveTextContent('Sau khi lưu, rau ngót sẽ tạm không được gợi ý');
    await user.click(save());
    expect(
      await screen.findByText(
        'Rau ngót tạm không được gợi ý cho đến khi bạn xác nhận lại sau khi hỏi ý kiến bác sĩ.',
      ),
    ).toBeInTheDocument();
    expect(sent[0]!.reaction).toEqual({ symptoms: ['rash'], severity: 'mild', note: 'Mẩn ở má' });
  });

  it('keeps the confirmation and paused foods when the meal reloads as logged', async () => {
    let logged = false;
    serveForm(() => (logged ? logFormFixture({ log: loggedFixture().log }) : logFormFixture()));
    serveLog(() => {
      logged = true;
      return HttpResponse.json(
        loggedFixture({ pausedIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }] }),
        { status: 201 },
      );
    });
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    await user.click(screen.getByRole('button', { name: 'Nổi mẩn đỏ' }));
    await user.click(save());
    expect(await screen.findByRole('heading', { name: 'Đã lưu ghi nhận' })).toBeInTheDocument();
    // The reload brought the log back; the confirmation must stay.
    await waitFor(() => expect(logged).toBe(true));
    await act(async () => {});
    expect(screen.getByText(/Rau ngót tạm không được gợi ý/)).toBeInTheDocument();
    expect(screen.queryByText(/đã ghi nhận lúc/)).not.toBeInTheDocument();
  });

  it('unselecting the last symptom sends no reaction', async () => {
    serveForm();
    const sent = serveLog();
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    await user.click(screen.getByRole('button', { name: 'Nôn trớ' }));
    await user.click(screen.getByRole('button', { name: 'Nôn trớ' }));
    await user.click(save());
    await screen.findByRole('heading', { name: 'Đã lưu ghi nhận' });
    expect(sent[0]!.reaction).toBeNull();
  });

  it.each([
    ['Khó thở', null],
    ['Sưng môi, mặt', null],
    ['Quấy khóc', 'Nặng'],
  ])('TC-LOG-016 "%s" (%s) shows the red banner towards S08', async (symptom, level) => {
    serveForm();
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await user.click(screen.getByRole('button', { name: symptom }));
    if (level) await user.click(screen.getByRole('button', { name: level }));
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('cần được xử lý ngay');
    expect(within(banner).getByRole('link', { name: 'Xem dấu hiệu nguy hiểm' })).toHaveAttribute(
      'href',
      `/urgent?mealId=${LUNCH_ID}`,
    );
  });

  it('a mild reaction shows no banner; a meal with nothing to pause says so', async () => {
    serveForm(() => logFormFixture({ firstTryIngredients: [], suspectIngredients: [] }));
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    expect(screen.queryByText(/lần đầu thử/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quấy khóc' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Ghi nhận được lưu vào nhật ký/)).toBeInTheDocument();
  });

  it('TC-LOG-017 keeps everything entered when saving fails offline, even after leaving', async () => {
    serveForm();
    serveLog(() => HttpResponse.error());
    const user = userEvent.setup();
    const first = renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    await user.click(screen.getByRole('button', { name: 'Tiêu chảy' }));
    await user.type(screen.getByLabelText('Ghi chú'), 'Đi ngoài 2 lần');
    await user.click(save());
    expect(await screen.findByText(/Chưa lưu được/)).toBeInTheDocument();
    first.unmount();

    renderApp(LOG_URL);
    await heading();
    expect(await screen.findByRole('button', { name: 'Nửa phần' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Tiêu chảy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Ghi chú')).toHaveValue('Đi ngoài 2 lần');
  });

  it('shows a refusal from the server (e.g. a time too far ahead)', async () => {
    serveForm();
    serveLog(() => problem(422, 'LOGGED_AT_OUT_OF_RANGE'));
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    const time = screen.getByLabelText('Giờ ghi nhận');
    await user.clear(time);
    await user.type(time, '23:00');
    await user.click(save());
    expect(await screen.findByText('Giờ ghi nhận không hợp lý với bữa này.')).toBeInTheDocument();
  });

  it('cannot save without a time', async () => {
    serveForm();
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    await user.clear(screen.getByLabelText('Giờ ghi nhận'));
    expect(save()).toBeDisabled();
  });

  it('TC-FAM-020 when another parent logged first, shows their log instead of the form', async () => {
    let logged = false;
    serveForm(() =>
      logged
        ? logFormFixture({ log: { ...loggedFixture().log, amount: 'all', liking: 5 } })
        : logFormFixture(),
    );
    serveLog(() => {
      logged = true;
      return problem(409, 'MEAL_ALREADY_LOGGED');
    });
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await heading();
    await fillBasics(user);
    await user.click(save());
    expect(await screen.findByText('Mẹ Na đã ghi nhận lúc 11:40')).toBeInTheDocument();
    expect(screen.getByText('Hết')).toBeInTheDocument();
    expect(sessionStorage.getItem(`log-draft:${LUNCH_ID}`)).toBeNull();
  });

  it('shows a meal already logged, with its reaction and note', async () => {
    serveForm(() =>
      logFormFixture({
        meal: { ...logFormFixture().meal, status: 'eaten' },
        log: {
          ...loggedFixture().log,
          reaction: { symptoms: ['rash', 'fussy'], severity: 'mild', note: 'Mẩn ở má' },
        },
      }),
    );
    renderApp(LOG_URL);
    expect(await screen.findByText('Mẹ Na đã ghi nhận lúc 11:40')).toBeInTheDocument();
    expect(screen.getByText('Nửa phần')).toBeInTheDocument();
    expect(screen.getByText('Mức thích 3/5')).toBeInTheDocument();
    expect(screen.getByText(/Nổi mẩn đỏ · Quấy khóc · Nhẹ/)).toBeInTheDocument();
    expect(screen.getByText('Mẩn ở má')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu ghi nhận' })).not.toBeInTheDocument();
  });

  it('shows a logged meal without a reaction; a deleted account has no name', async () => {
    serveForm(() => logFormFixture({ log: { ...loggedFixture().log, loggedBy: null } }));
    renderApp(LOG_URL);
    expect(await screen.findByText('Mức thích 3/5')).toBeInTheDocument();
    expect(screen.getByText('Người dùng đã xóa đã ghi nhận lúc 11:40')).toBeInTheDocument();
    expect(screen.queryByText('Phản ứng sau ăn')).not.toBeInTheDocument();
  });

  it('a meal of a past day starts at its planned time', async () => {
    serveForm(() => logFormFixture({ meal: { ...logFormFixture().meal, date: '2026-09-23' } }));
    renderApp(LOG_URL);
    expect(await screen.findByLabelText('Giờ ghi nhận')).toHaveValue('11:00');
  });

  it('opened from "Phản ứng", starts at the reaction section', async () => {
    serveForm();
    renderApp(`${LOG_URL}?reaction=1`);
    await heading();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Có dấu hiệu bất thường?' })).toHaveFocus(),
    );
  });

  it('"Bé có dấu hiệu nguy hiểm" opens S08 for this meal', async () => {
    serveForm();
    renderApp(LOG_URL);
    await heading();
    expect(screen.getByRole('link', { name: 'Bé có dấu hiệu nguy hiểm' })).toHaveAttribute(
      'href',
      `/urgent?mealId=${LUNCH_ID}`,
    );
  });

  it('says so for a meal that does not exist, and retries other failures', async () => {
    serveForm(() => problem(404, 'MEAL_NOT_FOUND'));
    const { unmount } = renderApp(LOG_URL);
    expect(await screen.findByText('Không tìm thấy bữa ăn này.')).toBeInTheDocument();
    unmount();

    let attempts = 0;
    serveForm(() => (++attempts === 1 ? problem(500, 'INTERNAL') : logFormFixture()));
    const user = userEvent.setup();
    renderApp(LOG_URL);
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('button', { name: 'Nửa phần' })).toBeInTheDocument();
  });

  it('closes back to the previous screen, or to today after a deep link', async () => {
    serveForm();
    const user = userEvent.setup();
    const { router } = renderApp(LOG_URL);
    await heading();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    await act(() => router.navigate(LOG_URL));
    await heading();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
