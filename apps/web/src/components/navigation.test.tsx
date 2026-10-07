import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BottomNav } from './BottomNav';
import { ScreenHeader } from './ScreenHeader';

function at(path: string, element: React.ReactNode) {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('BottomNav', () => {
  it('has the 5 tabs of the design and marks the current one', () => {
    at('/week', <BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const links = nav.querySelectorAll('a');
    expect([...links].map((a) => a.textContent)).toEqual([
      'Hôm nay',
      'Tuần',
      'Món ăn',
      'Nhật ký',
      'Hồ sơ bé',
    ]);
    expect(screen.getByRole('link', { name: 'Tuần' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Hôm nay' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Hôm nay active only on the exact home path', () => {
    at('/', <BottomNav />);
    expect(screen.getByRole('link', { name: 'Hôm nay' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('ScreenHeader', () => {
  it('renders a back link and the title', () => {
    at('/x', <ScreenHeader title="Công thức món" back="/" />);
    expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: 'Công thức món' })).toBeInTheDocument();
  });

  it('renders a close link instead when asked', () => {
    at('/x', <ScreenHeader title="Đổi món" close="/" />);
    expect(screen.getByRole('link', { name: 'Đóng' })).toHaveAttribute('href', '/');
  });

  it('can show a trailing element and no navigation', () => {
    at('/x', <ScreenHeader title="Tạo hồ sơ bé" trailing={<span>3/5</span>} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });
});
