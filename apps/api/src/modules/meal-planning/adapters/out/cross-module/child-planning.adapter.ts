import { Inject, Injectable } from '@nestjs/common';
import { ChildProfileService } from '../../../../child-profile/application/use-cases/child-profile.service.js';
import { ChildNotFoundError } from '../../../../child-profile/domain/errors.js';
import type {
  ChildPlanningInfo,
  ChildPlanningReader,
} from '../../../application/ports/out/child-planning.reader.js';
import type { StageId } from '../../../domain/model.js';

/** Anti-corruption layer over the child-profile module (ownership, age, stage, avoid lists). */
@Injectable()
export class ChildPlanningAdapter implements ChildPlanningReader {
  constructor(@Inject(ChildProfileService) private readonly profiles: ChildProfileService) {}

  async find(childId: string, userId: string): Promise<ChildPlanningInfo | null> {
    try {
      const child = await this.profiles.get(userId, childId);
      return {
        childId: child.id,
        ageMonths: child.age.months,
        stage: child.effectiveStage as StageId | null,
        avoidAllergens: child.avoidAllergens,
        avoidIngredients: child.avoidIngredients.map((i) => i.ingredientId),
      };
    } catch (error) {
      if (error instanceof ChildNotFoundError) return null;
      throw error;
    }
  }
}
