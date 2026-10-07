import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { renderWithQuery } from '../../test/render';
import { HealthStatus } from './HealthStatus';

const HEALTH = '*/api/v1/health';

describe('HealthStatus', () => {
  it('shows a loading state while checking', async () => {
    server.use(http.get(HEALTH, () => new Promise(() => {})));
    renderWithQuery(<HealthStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra máy chủ…');
  });

  it('shows that the server works when the API answers ok', async () => {
    server.use(
      http.get(HEALTH, () => HttpResponse.json({ status: 'ok', checks: { database: 'up' } })),
    );
    renderWithQuery(<HealthStatus />);
    expect(await screen.findByText('Máy chủ hoạt động bình thường')).toBeInTheDocument();
  });

  it('TC-UI-013 shows an error with a working retry when the database is down', async () => {
    let calls = 0;
    server.use(
      http.get(HEALTH, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { status: 503, code: 'SERVICE_UNAVAILABLE' },
              { status: 503, headers: { 'content-type': 'application/problem+json' } },
            )
          : HttpResponse.json({ status: 'ok', checks: { database: 'up' } });
      }),
    );
    renderWithQuery(<HealthStatus />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang gặp sự cố');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Máy chủ hoạt động bình thường')).toBeInTheDocument();
  });

  it('TC-UI-019 explains a lost connection differently from a server error', async () => {
    server.use(http.get(HEALTH, () => HttpResponse.error()));
    renderWithQuery(<HealthStatus />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });
});
