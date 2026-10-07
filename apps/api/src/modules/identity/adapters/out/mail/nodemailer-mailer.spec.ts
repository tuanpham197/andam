import { createTransport } from 'nodemailer';
import { DisabledMailer } from './disabled-mailer.js';
import { NodemailerMailer, createMailer, createSmtpTransport } from './nodemailer-mailer.js';

describe('NodemailerMailer', () => {
  it('sends a Vietnamese password reset e-mail with the link in text and HTML', async () => {
    const transport = createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const sendMail = transport.sendMail.bind(transport);
    transport.sendMail = (async (options: Parameters<typeof sendMail>[0]) => {
      const info = await sendMail(options);
      sent.push(info.message as unknown as string);
      return info;
    }) as typeof transport.sendMail;

    const mailer = new NodemailerMailer(transport, 'Thực đơn <no-reply@thucdon.test>');
    const resetUrl = 'https://thucdon.test/reset-password?token=abc&x=<y>';
    await mailer.sendPasswordReset({ to: 'na@example.vn', resetUrl });

    const message = JSON.parse(sent[0]!);
    expect(message.to).toEqual([{ address: 'na@example.vn', name: '' }]);
    expect(message.from).toEqual({ address: 'no-reply@thucdon.test', name: 'Thực đơn' });
    expect(message.subject).toBe('Đặt lại mật khẩu — Thực đơn ăn dặm');
    expect(message.text).toContain(resetUrl);
    expect(message.text).toContain('30 phút');
    expect(message.html).toContain('https://thucdon.test/reset-password?token=abc&amp;x=&lt;y&gt;');
    expect(message.html).not.toContain('<y>');
  });

  it('builds an SMTP transport from a URL without connecting', () => {
    const transport = createSmtpTransport('smtp://localhost:1025');
    expect(transport.transporter.name).toBe('SMTP');
  });

  it('picks SMTP for a URL and no mailer at all for "disabled"', () => {
    expect(createMailer('smtp://localhost:1025', 'x <a@b.vn>')).toBeInstanceOf(NodemailerMailer);
    expect(createMailer('disabled', 'x <a@b.vn>')).toBeInstanceOf(DisabledMailer);
  });
});
