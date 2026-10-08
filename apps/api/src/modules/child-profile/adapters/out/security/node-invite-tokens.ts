import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { InviteTokens } from '../../../application/ports/out/invite-tokens.port.js';

@Injectable()
export class NodeInviteTokens implements InviteTokens {
  create(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
