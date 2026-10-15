import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { FoodProgressDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { NA_ID, foodProgressFixture, weekFixture } from '../test/fixtures';
import { server } from '../test/server';

function serveFoods(answer: () => FoodProgressDto | Response = () => foodProgressFixture()) {
  server.use(
    http.get(`${API}/children/:childId/foods`, ({ params }) => {
      expect(params.childId).toBe(NA_ID);
      const body = answer();
      return body instanceof Response ? body : HttpResponse.json(body);
    }),
  );
}

beforeEach(() => server.use(signedIn()));

describe('Food journey (G16, UC-26, TC-UX-020)', () => {
  it('shows the progress, the other counts and the bar', async () => {
    serveFoods();
    renderApp('/foods');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hành trình thử thực phẩm của bé Na' }),
    ).toBeInTheDocument();
    const progress = within(await screen.findByRole('region', { name: 'Tiến độ thử thực phẩm' }));
    expect(progress.getByText('Đã thử 2 / 5 thực phẩm')).toBeInTheDocument();
    expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(
      progress.getByText('1 đang tạm dừng · 1 cần tránh theo hồ sơ · 1 chưa hợp tuổi'),
    ).toBeInTheDocument();
  });

  it('lists the first tries ahead, earliest first, each opening its day', async () => {
    serveFoods();
    renderApp('/foods');
    const upcoming = within(await screen.findByRole('region', { name: 'Sắp thử lần đầu' }));
    const links = upcoming.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([
      'Cà rốtLần đầu vào Thứ Sáu, 25 tháng 9',
      'Cá hồiLần đầu vào Thứ Bảy, 26 tháng 9',
    ]);
    expect(links[0]).toHaveAttribute('href', '/week/2026-09-25');
  });

  it('labels each food of each group, with the age a food opens at', async () => {
    serveFoods();
    renderApp('/foods');
    const protein = within(await screen.findByRole('region', { name: 'Đạm' }));
    expect(protein.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Cá hồiChưa thử',
      'Thịt gàĐã thử',
      'Trứng gàCần tránh',
    ]);
    expect(within(screen.getByRole('region', { name: 'Rau củ' })).getByText('Đang tạm dừng'));
    expect(within(screen.getByRole('region', { name: 'Trái cây' })).getByText('Từ 12 tháng'));
    expect(screen.getByRole('link', { name: /dùng lại ở trang Hồ sơ bé/ })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('says when nothing new is planned, and counts nothing out of nothing', async () => {
    serveFoods(() =>
      foodProgressFixture({
        summary: { tried: 0, total: 0, paused: 0, avoided: 0, notYet: 0 },
        groups: [
          { group: 'protein', items: [] },
          { group: 'veg', items: [] },
          { group: 'fruit', items: [] },
        ],
      }),
    );
    renderApp('/foods');
    expect(
      await screen.findByText('Chưa có thực phẩm mới trong thực đơn 2 tuần tới.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText(/dùng lại ở trang Hồ sơ bé/)).toBeNull();
  });

  it('offers a retry when it cannot load', async () => {
    serveFoods(() => problem(500, 'X'));
    renderApp('/foods');
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    serveFoods();
    await userEvent.setup().click(retry);
    expect(await screen.findByText('Đã thử 2 / 5 thực phẩm')).toBeInTheDocument();
  });

  it('is reached from the profile and from the week', async () => {
    serveFoods();
    server.use(
      http.get(`${API}/children/:childId/weeks/:weekStart`, () => HttpResponse.json(weekFixture())),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/week');
    await user.click(await screen.findByRole('link', { name: 'Xem hành trình thử thực phẩm' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/foods'));
    await user.click(screen.getByRole('link', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'));
    await user.click(await screen.findByRole('link', { name: 'Hành trình thử thực phẩm' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/foods'));
  });
});
