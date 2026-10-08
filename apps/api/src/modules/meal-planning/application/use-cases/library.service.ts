import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { APP_TIMEZONE, addDays, toLocalDate } from '../../../../shared/kernel/local-date.js';
import { ChildNotPlannableError, PlanChildNotFoundError } from '../../domain/errors.js';
import { filterLibrary, type LibraryChip } from '../../domain/library.js';
import type { MealSlot, MealType, Texture } from '../../domain/model.js';
import type { ExclusionReason, ExclusionSummary } from '../../domain/safety-filter.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PlanningDishes } from './planning-dishes.js';
import {
  dishMap,
  dishSummary,
  loadPlanningContext,
  namedIngredients,
  toUse,
} from './planning-context.js';

export interface LibraryView {
  dishes: (ReturnType<typeof dishSummary> & {
    mealType: MealType;
    texture: Texture;
    newIngredients: { id: string; name: string }[];
    liked: boolean;
    lastEaten: { daysAgo: number; slot: MealSlot } | null;
  })[];
  hidden: ExclusionSummary & {
    items: { dishId: string; name: string; reason: ExclusionReason }[];
  };
}

/** UC-07: the dish library, already filtered for this child. */
@Injectable()
export class LibraryService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async search(
    userId: string,
    childId: string,
    filter: { q?: string; chip?: LibraryChip; fresh?: boolean },
  ): Promise<LibraryView> {
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();
    if (child.stage === null) throw new ChildNotPlannableError();

    const today = toLocalDate(this.clock.now(), APP_TIMEZONE);
    const [{ ctx }, recent] = await Promise.all([
      loadPlanningContext(this.catalog, this.history, child, child.stage, today),
      this.plans.findBetween(childId, addDays(today, -7), today),
    ]);
    const result = filterLibrary(ctx, {
      today,
      query: filter.q ?? '',
      chip: filter.chip ?? 'all',
      fresh: filter.fresh ?? false,
      eaten: recent.filter((m) => m.status === 'eaten').map(toUse),
    });
    const byId = dishMap(ctx.dishes);

    return {
      dishes: result.dishes.map((entry) => ({
        ...dishSummary(entry.dish, ctx.ingredients),
        mealType: entry.dish.mealType,
        texture: entry.texture,
        newIngredients: namedIngredients(entry.newIngredientIds, ctx.ingredients),
        liked: entry.liked,
        lastEaten: entry.lastEaten,
      })),
      hidden: {
        ...result.hidden,
        items: result.hidden.items.map((item) => ({
          ...item,
          name: byId.get(item.dishId)!.name,
        })),
      },
    };
  }
}
