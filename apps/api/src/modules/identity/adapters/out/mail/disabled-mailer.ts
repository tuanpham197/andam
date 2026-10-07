import { Logger } from '@nestjs/common';
import type { Mailer } from '../../../application/ports/out/mailer.port.js';

/**
 * Stands in when SMTP_URL=disabled (staging demo without a mail server): the request still
 * succeeds for the parent, nothing is sent. The reset link carries a token, so it is never logged.
 */
export class DisabledMailer implements Mailer {
  constructor(private readonly logger = new Logger('Mailer')) {}

  async sendPasswordReset(_input: { to: string; resetUrl: string }): Promise<void> {
    this.logger.warn('E-mail is disabled (SMTP_URL=disabled): password reset e-mail not sent');
  }
}
