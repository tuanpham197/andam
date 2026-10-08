import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/routes';
import { signedIn } from '../test/api';
import { renderApp } from '../test/app';
import { server } from '../test/server';
import { ErrorPage } from './ErrorPage';

function Crash(): never {
  throw new Error('boom');
}

describe('ErrorPage (P7)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('catches a crash anywhere in the app', () => {
    expect(routes[0]!.errorElement).toEqual(<ErrorPage />);
  });

  it('says a screen crashed and offers a reload or the way home', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const router = createMemoryRouter([
      { path: '/', element: <Crash />, errorElement: <ErrorPage /> },
    ]);
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Có lỗi xảy ra' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang Hôm nay' })).toHaveAttribute('href', '/');
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại trang' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('OfflineBanner (NFR-008)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells the parent when the network is gone, and hides once it is back', async () => {
    server.use(signedIn());
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    renderApp('/');
    await screen.findByRole('navigation');
    const note = /Không có kết nối mạng/;
    expect(screen.queryByText(note)).not.toBeInTheDocument();

    online.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(note)).toBeInTheDocument();

    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });
});
