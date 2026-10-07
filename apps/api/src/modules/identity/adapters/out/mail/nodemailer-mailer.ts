import { createTransport, type Transporter } from 'nodemailer';
import type { Mailer } from '../../../application/ports/out/mailer.port.js';
import { DisabledMailer } from './disabled-mailer.js';

export function createSmtpTransport(smtpUrl: string): Transporter {
  return createTransport(smtpUrl);
}

/** The mailer for an SMTP_URL: a real SMTP sender, or none at all when it is "disabled". */
export function createMailer(smtpUrl: string, from: string): Mailer {
  return smtpUrl === 'disabled'
    ? new DisabledMailer()
    : new NodemailerMailer(createSmtpTransport(smtpUrl), from);
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class NodemailerMailer implements Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  async sendPasswordReset(input: { to: string; resetUrl: string }): Promise<void> {
    const url = escapeHtml(input.resetUrl);
    await this.transport.sendMail({
      from: this.from,
      to: input.to,
      subject: 'Đặt lại mật khẩu — Thực đơn ăn dặm',
      text: [
        'Chào bạn,',
        '',
        'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản Thực đơn ăn dặm.',
        `Mở liên kết sau trong vòng 30 phút để đặt mật khẩu mới: ${input.resetUrl}`,
        '',
        'Nếu bạn không yêu cầu, hãy bỏ qua e-mail này — mật khẩu của bạn vẫn giữ nguyên.',
      ].join('\n'),
      html: `<p>Chào bạn,</p>
<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản Thực đơn ăn dặm.</p>
<p><a href="${url}">Đặt mật khẩu mới</a> — liên kết có hiệu lực trong 30 phút.</p>
<p>Nếu bạn không yêu cầu, hãy bỏ qua e-mail này.</p>`,
    });
  }
}
