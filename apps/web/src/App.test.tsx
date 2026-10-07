import { render, screen } from '@testing-library/react';
import { signedOut } from './test/api';
import { server } from './test/server';
import { App } from './App';

describe('App', () => {
  it('boots the router and sends a signed-out visitor to login', async () => {
    server.use(signedOut());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
