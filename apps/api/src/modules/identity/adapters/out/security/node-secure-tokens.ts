import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { SecureTokens } from '../../../application/ports/out/secure-tokens.port.js';

@Injectable()
export class NodeSecureTokens implements SecureTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
