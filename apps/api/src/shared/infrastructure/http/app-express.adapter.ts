import { ExpressAdapter } from '@nestjs/platform-express';
import { bodyParserCodeOf } from './problem-details.filter.js';

/**
 * Nest turns every body-parser SyntaxError into a plain BadRequestException, losing the
 * `type` that tells "malformed JSON" apart. Keep those errors intact so ProblemDetailsFilter
 * can answer with a precise code (TC-API-001).
 */
export class AppExpressAdapter extends ExpressAdapter {
  override mapException(error: unknown): unknown {
    return bodyParserCodeOf(error) ? error : super.mapException(error);
  }
}
