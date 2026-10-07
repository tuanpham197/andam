import type { Logger } from '@nestjs/common';
import { DisabledMailer } from './disabled-mailer.js';

describe('DisabledMailer', () => {
  it('sends nothing and warns without logging the address or the reset link', async () => {
    const warn = vi.fn();
    const mailer = new DisabledMailer({ warn } as unknown as Logger);
    await expect(
      mailer.sendPasswordReset({
        to: 'na@example.vn',
        resetUrl: 'https://thucdon.test/reset-password?token=secret',
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]!.join(' ')).not.toMatch(/na@example|secret/);
  });

  it('logs under the Mailer context by default', () => {
    expect(() => new DisabledMailer()).not.toThrow();
  });
});
