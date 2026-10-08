import { Inject, Injectable } from '@nestjs/common';
import { PauseService } from '../../../../safety/application/use-cases/pause.service.js';
import type { ReactionSafety } from '../../../application/ports/out/reaction-safety.port.js';

/** Hands suspected foods to the safety module (UC-17), inside the logging transaction. */
@Injectable()
export class ReactionSafetyAdapter implements ReactionSafety {
  constructor(@Inject(PauseService) private readonly pauses: PauseService) {}

  pauseAfterReaction(input: {
    userId: string;
    childId: string;
    ingredientIds: string[];
    logId: string;
    mealId: string;
  }): Promise<{ id: string; name: string }[]> {
    return this.pauses.pause({
      userId: input.userId,
      childId: input.childId,
      ingredientIds: input.ingredientIds,
      reason: 'reaction',
      sourceLogId: input.logId,
      sourceMealId: input.mealId,
    });
  }
}
