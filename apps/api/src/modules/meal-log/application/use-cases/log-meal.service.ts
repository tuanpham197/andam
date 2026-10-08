import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import { LogMealNotFoundError, MealLoggedTwiceError } from '../../domain/errors.js';
import {
  MealLog,
  exposureUpdates,
  suspectIngredientIds,
  type Reaction,
} from '../../domain/meal-log.js';
import type {
  EatAmount,
  LoggableMeal,
  MealOutcome,
  Severity,
  Symptom,
} from '../../domain/model.js';
import { LOGGABLE_MEALS, type LoggableMeals } from '../ports/out/loggable-meals.port.js';
import { MEAL_LOG_REPOSITORY, type MealLogRepository } from '../ports/out/meal-log.repository.js';
import { REACTION_SAFETY, type ReactionSafety } from '../ports/out/reaction-safety.port.js';

type Named = { id: string; name: string };

export interface LogView {
  id: string;
  mealId: string;
  loggedAt: Date;
  /** FR-118; null when the account behind it was deleted. */
  loggedBy: string | null;
  amount: EatAmount;
  liking: number;
  outcome: MealOutcome;
  reaction: Reaction | null;
}

/** S07 before saving: the meal, its first tries, and what a reaction would pause (BR-40). */
export interface LogFormView {
  meal: Pick<LoggableMeal, 'id' | 'date' | 'slot' | 'time' | 'status' | 'dish'>;
  firstTryIngredients: Named[];
  suspectIngredients: Named[];
  log: LogView | null;
}

export interface LogMealInput {
  loggedAt: Date;
  amount: EatAmount;
  liking: number;
  reaction?: { symptoms: Symptom[]; severity: Severity; note?: string | null } | null;
}

export interface LoggedMealView {
  log: LogView;
  pausedIngredients: Named[];
}

const toView = (log: MealLog, loggedBy: string | null): LogView => ({
  id: log.id,
  mealId: log.mealId,
  loggedAt: log.loggedAt,
  loggedBy,
  amount: log.amount,
  liking: log.liking,
  outcome: log.outcome,
  reaction: log.reaction,
});

/** UC-08 / UC-09: log what the child ate and any reaction; suspected foods pause at once. */
@Injectable()
export class LogMealService {
  constructor(
    @Inject(LOGGABLE_MEALS) private readonly meals: LoggableMeals,
    @Inject(MEAL_LOG_REPOSITORY) private readonly logs: MealLogRepository,
    @Inject(REACTION_SAFETY) private readonly safety: ReactionSafety,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  private async meal(userId: string, mealId: string): Promise<LoggableMeal> {
    const meal = await this.meals.find(userId, mealId);
    if (!meal) throw new LogMealNotFoundError();
    return meal;
  }

  async form(userId: string, mealId: string): Promise<LogFormView> {
    const meal = await this.meal(userId, mealId);
    const names = new Map(meal.ingredients.map((i) => [i.id, i.name]));
    const named = (ids: string[]) => ids.map((id) => ({ id, name: names.get(id)! }));
    const [log, who] = await Promise.all([
      this.logs.findByMeal(mealId),
      this.logs.whoLogged(mealId),
    ]);
    return {
      meal: {
        id: meal.id,
        date: meal.date,
        slot: meal.slot,
        time: meal.time,
        status: meal.status,
        dish: meal.dish,
      },
      firstTryIngredients: named(meal.firstTryIds),
      suspectIngredients: named(suspectIngredientIds(meal, true)),
      log: log && toView(log, who?.name ?? null),
    };
  }

  async log(userId: string, mealId: string, input: LogMealInput): Promise<LoggedMealView> {
    const meal = await this.meal(userId, mealId);
    if (meal.status === 'eaten' || meal.status === 'refused') {
      throw new MealLoggedTwiceError((await this.logs.whoLogged(mealId)) ?? undefined);
    }
    const log = MealLog.record({
      id: this.ids.next(),
      meal,
      loggedAt: input.loggedAt,
      now: this.clock.now(),
      amount: input.amount,
      liking: input.liking,
      reaction: input.reaction,
      actorId: userId,
    });
    // Log, exposures, meal status, pauses and the replanned meals commit together (TC-LOG-013).
    return this.uow.run(async () => {
      await this.logs.add(log);
      const actorName = (await this.logs.whoLogged(mealId))!.name;
      await this.logs.recordExposures(meal.childId, exposureUpdates(meal, log));
      await this.meals.markLogged(userId, mealId, log.outcome);
      const suspects = suspectIngredientIds(meal, log.reaction !== null);
      const paused =
        suspects.length === 0
          ? []
          : await this.safety.pauseAfterReaction({
              userId,
              childId: meal.childId,
              ingredientIds: suspects,
              logId: log.id,
              mealId,
            });
      return { log: toView(log, actorName), pausedIngredients: paused };
    });
  }
}
