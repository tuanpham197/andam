import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { PausedIngredientDto } from '@appandam/api-client';
import { API, problem, signedIn } from '../../test/api';
import { renderApp } from '../../test/app';
import { NA_ID, pausedFixture } from '../../test/fixtures';
import { server } from '../../test/server';

function servePaused(list: () => PausedIngredientDto[] | Response) {
  server.use(
    http.get(`${API}/children/:childId/paused-ingredients`, ({ params }) => {
      expect(params.childId).toBe(NA_ID);
      const body = list();
      return body instanceof Response ? body : HttpResponse.json(body);
    }),
  );
}

const card = async () =>
  within(await screen.findByRole('region', { name: 'Nguyên liệu tạm dừng' }));

beforeEach(() => server.use(signedIn()));

describe('Paused foods in the profile (G08)', () => {
  it('lists each paused food with why, since when and after which meal', async () => {
    servePaused(() => [
      pausedFixture(),
      pausedFixture({
        id: 'p2',
        ingredientId: 'ing_ca_hoi',
        name: 'Cá hồi',
        reason: 'urgent',
        meal: null,
      }),
    ]);
    renderApp('/profile');
    const paused = await card();
    expect(await paused.findByText('Rau ngót')).toBeInTheDocument();
    expect(paused.getByText('Sau phản ứng · từ 24/9')).toBeInTheDocument();
    expect(paused.getByText('Cháo cá hồi rau ngót · Trưa')).toBeInTheDocument();
    expect(paused.getByText('Sau dấu hiệu nguy hiểm · từ 24/9')).toBeInTheDocument();
  });

  it('says when nothing is paused', async () => {
    renderApp('/profile');
    expect(
      await (await card()).findByText('Không có nguyên liệu nào đang tạm dừng.'),
    ).toBeInTheDocument();
  });

  it('TC-RES-004 resumes only after the second confirmation, then refreshes the list', async () => {
    let paused = [pausedFixture()];
    servePaused(() => paused);
    const resumed: string[] = [];
    server.use(
      http.post(
        `${API}/children/:childId/paused-ingredients/:ingredientId/resume`,
        ({ params }) => {
          resumed.push(params.ingredientId as string);
          paused = [];
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const list = await card();
    await user.click(
      await list.findByRole('button', { name: 'Bác sĩ đã cho phép dùng lại Rau ngót' }),
    );
    expect(resumed).toEqual([]);
    expect(list.getByText(/Dùng lại Rau ngót\?/)).toBeInTheDocument();
    await user.click(list.getByRole('button', { name: 'Hủy' }));
    await user.click(list.getByRole('button', { name: 'Bác sĩ đã cho phép dùng lại Rau ngót' }));
    await user.click(list.getByRole('button', { name: 'Xác nhận dùng lại' }));
    await waitFor(() => expect(resumed).toEqual(['ing_rau_ngot']));
    expect(await list.findByText('Không có nguyên liệu nào đang tạm dừng.')).toBeInTheDocument();
  });

  it('reports a failed resume and keeps the food listed', async () => {
    servePaused(() => [pausedFixture()]);
    server.use(
      http.post(`${API}/children/:childId/paused-ingredients/:ingredientId/resume`, () =>
        problem(409, 'INGREDIENT_NOT_PAUSED'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/profile');
    const list = await card();
    await user.click(await list.findByRole('button', { name: /Bác sĩ đã cho phép dùng lại/ }));
    await user.click(list.getByRole('button', { name: 'Xác nhận dùng lại' }));
    expect(await list.findByText('Nguyên liệu này không còn tạm dừng.')).toBeInTheDocument();
  });

  it('retries a failed load', async () => {
    let attempts = 0;
    servePaused(() => (++attempts === 1 ? problem(500, 'INTERNAL') : [pausedFixture()]));
    const user = userEvent.setup();
    renderApp('/profile');
    const list = await card();
    await user.click(await list.findByRole('button', { name: 'Thử lại' }));
    expect(await list.findByText('Rau ngót')).toBeInTheDocument();
  });
});
