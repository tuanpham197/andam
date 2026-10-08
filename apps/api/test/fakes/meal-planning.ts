import type {
  CustomDish,
  StageDefault,
} from '../../src/modules/meal-planning/domain/custom-dish.js';
import type { StageSchedule } from '../../src/modules/meal-planning/domain/menu-engine.js';
import type {
  DishFeedback,
  HealthState,
  StageId,
} from '../../src/modules/meal-planning/domain/model.js';
import { PlannedMeal } from '../../src/modules/meal-planning/domain/planned-meal.js';
import type { SwapEvent } from '../../src/modules/meal-planning/domain/swap.js';
import type {
  ChildPlanningInfo,
  ChildPlanningReader,
} from '../../src/modules/meal-planning/application/ports/out/child-planning.reader.js';
import type { CustomDishRepository } from '../../src/modules/meal-planning/application/ports/out/custom-dish.repository.js';
import type { FoodHistoryReader } from '../../src/modules/meal-planning/application/ports/out/food-history.reader.js';
import type { MealPlanRepository } from '../../src/modules/meal-planning/application/ports/out/meal-plan.repository.js';
import type {
  PlanningCatalog,
  Recipe,
} from '../../src/modules/meal-planning/application/ports/out/planning-catalog.port.js';
import { CustomDishService } from '../../src/modules/meal-planning/application/use-cases/custom-dish.service.js';
import { DayPlanService } from '../../src/modules/meal-planning/application/use-cases/day-plan.service.js';
import { LibraryService } from '../../src/modules/meal-planning/application/use-cases/library.service.js';
import { MealAccessService } from '../../src/modules/meal-planning/application/use-cases/meal-access.service.js';
import { PlanningDishes } from '../../src/modules/meal-planning/application/use-cases/planning-dishes.js';
import { RecipeService } from '../../src/modules/meal-planning/application/use-cases/recipe.service.js';
import { RegenerateFutureService } from '../../src/modules/meal-planning/application/use-cases/regenerate-future.service.js';
import { SwapService } from '../../src/modules/meal-planning/application/use-cases/swap.service.js';
import { WeekPlanService } from '../../src/modules/meal-planning/application/use-cases/week-plan.service.js';
import { FixedClock, ImmediateUnitOfWork, SequenceIds, type Snapshotable } from './kernel.js';
import { catalogFixture } from './meal-planning-fixtures.js';

const copy = (m: PlannedMeal) =>
  PlannedMeal.restore({
    id: m.id,
    childId: m.childId,
    date: m.date,
    slot: m.slot,
    time: m.time,
    dishId: m.dishId,
    stageId: m.stageId,
    texture: m.texture,
    portionText: m.portionText,
    status: m.status,
    newIngredientIds: [...m.newIngredientIds],
    source: m.source,
    generatedAt: m.generatedAt,
  });

export class InMemoryMealPlans implements MealPlanRepository, Snapshotable {
  readonly rows = new Map<string, PlannedMeal>();
  readonly owners = new Map<string, string>();
  swaps: SwapEvent[] = [];

  async findBetween(childId: string, from: string, to: string) {
    return [...this.rows.values()]
      .filter((m) => m.childId === childId && m.date >= from && m.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .map(copy);
  }
  async addMany(meals: PlannedMeal[]) {
    const taken = (m: PlannedMeal) =>
      [...this.rows.values()].some(
        (r) => r.childId === m.childId && r.date === m.date && r.slot === m.slot,
      );
    if (meals.some(taken)) return false;
    for (const m of meals) this.rows.set(m.id, copy(m));
    return true;
  }
  async findOwned(mealId: string, userId: string) {
    const meal = this.rows.get(mealId);
    return meal && this.owners.get(meal.childId) === userId ? copy(meal) : null;
  }
  async save(meal: PlannedMeal) {
    this.rows.set(meal.id, copy(meal));
  }
  async remove(mealIds: string[]) {
    for (const id of mealIds) this.rows.delete(id);
  }
  async saveSwap(meal: PlannedMeal, fromDishId: string) {
    const stored = this.rows.get(meal.id);
    if (!stored || stored.dishId !== fromDishId || !stored.isPending) return false;
    this.rows.set(meal.id, copy(meal));
    return true;
  }
  async recordSwap(event: SwapEvent) {
    this.swaps.push({ ...event });
  }
  snapshot() {
    return { rows: [...this.rows.values()].map(copy), swaps: [...this.swaps] };
  }
  restore(state: unknown) {
    const { rows, swaps } = state as ReturnType<InMemoryMealPlans['snapshot']>;
    this.rows.clear();
    for (const m of rows) this.rows.set(m.id, m);
    this.swaps = swaps;
  }
  /** Test helper: stores a meal directly. */
  put(meal: PlannedMeal) {
    this.rows.set(meal.id, copy(meal));
  }
}

const copyDish = (d: CustomDish): CustomDish => ({
  ...d,
  lines: d.lines.map((l) => ({ ...l })),
  steps: [...d.steps],
});

export class InMemoryCustomDishes implements CustomDishRepository, Snapshotable {
  rows: CustomDish[] = [];
  readonly creators = new Map<string, string>();
  async listForChild(childId: string) {
    return this.rows.filter((d) => d.childId === childId).map(copyDish);
  }
  async create(dish: CustomDish, createdBy: string) {
    this.rows.push(copyDish(dish));
    this.creators.set(dish.id, createdBy);
  }
  async update(dish: CustomDish) {
    this.rows = this.rows.map((d) => (d.id === dish.id ? copyDish(dish) : d));
  }
  async archive(dishId: string, at: Date) {
    this.rows = this.rows.map((d) => (d.id === dishId ? { ...d, archivedAt: at } : d));
  }
  snapshot() {
    return this.rows.map(copyDish);
  }
  restore(state: unknown) {
    this.rows = state as CustomDish[];
  }
}

export class FakeChildren implements ChildPlanningReader {
  /** `userId` owns the child; `caregivers` are its other members (BR-73). */
  readonly rows = new Map<
    string,
    { userId: string; caregivers?: string[]; info: ChildPlanningInfo }
  >();
  roleOf(childId: string, userId: string): 'owner' | 'caregiver' | null {
    const row = this.rows.get(childId);
    if (!row) return null;
    if (row.userId === userId) return 'owner';
    return row.caregivers?.includes(userId) ? 'caregiver' : null;
  }
  async find(childId: string, userId: string) {
    return this.roleOf(childId, userId) ? { ...this.rows.get(childId)!.info } : null;
  }
}

const SCHEDULES: Record<StageId, StageSchedule> = {
  1: {
    mainMeals: 2,
    snacksMin: 0,
    schedule: [
      { slot: 'breakfast', time: '08:00' },
      { slot: 'lunch', time: '11:00' },
    ],
  },
  2: {
    mainMeals: 3,
    snacksMin: 1,
    schedule: [
      { slot: 'breakfast', time: '07:30' },
      { slot: 'lunch', time: '11:00' },
      { slot: 'afternoon_snack', time: '15:00' },
      { slot: 'dinner', time: '18:00' },
    ],
  },
  3: {
    mainMeals: 3,
    snacksMin: 1,
    schedule: [
      { slot: 'breakfast', time: '07:30' },
      { slot: 'morning_snack', time: '09:30' },
      { slot: 'lunch', time: '11:00' },
      { slot: 'afternoon_snack', time: '15:00' },
      { slot: 'dinner', time: '18:00' },
    ],
  },
  4: {
    mainMeals: 3,
    snacksMin: 1,
    schedule: [
      { slot: 'breakfast', time: '07:30' },
      { slot: 'lunch', time: '11:30' },
      { slot: 'afternoon_snack', time: '15:00' },
      { slot: 'dinner', time: '18:30' },
    ],
  },
};

export class FakeCatalog implements PlanningCatalog {
  constructor(public data = catalogFixture()) {}
  async dishes() {
    return this.data.dishes;
  }
  async ingredients() {
    return [...this.data.ingredients.values()];
  }
  async schedule(stage: StageId) {
    return SCHEDULES[stage];
  }
  async stageDefaults(): Promise<StageDefault[]> {
    return [
      { stage: 1, texture: 'puree_smooth', portionText: '2–3 thìa, tăng dần' },
      { stage: 2, texture: 'lumpy', portionText: 'Khoảng 125 ml' },
      { stage: 3, texture: 'minced_soft', portionText: 'Khoảng 125 ml' },
      { stage: 4, texture: 'family', portionText: '175–250 ml' },
    ];
  }
  async recipe(dishId: string): Promise<Recipe | null> {
    const dish = this.data.dishes.find((d) => d.id === dishId);
    if (!dish) return null;
    return {
      dish,
      description: `Mô tả ${dish.name}`,
      imageUrl: null,
      tool: 'Nồi',
      contentVersion: 3,
      reviewedBy: 'Chuyên gia A',
      variants: dish.variants.map((v) => ({ ...v, portionMl: null })),
      lines: dish.ingredientIds.map((id) => {
        const i = this.data.ingredients.get(id)!;
        return {
          ingredientId: id,
          name: i.name,
          qty: 20,
          unit: 'g',
          isMain: i.foodGroup === 'protein',
          foodGroup: i.foodGroup,
          allergenTags: i.allergenTags,
        };
      }),
      steps: ['Bước 1', 'Bước 2'],
      safetyNotes: ['Không thêm muối, nước mắm hay đường cho bé dưới 1 tuổi.'],
    };
  }
}

export class FakeHistory implements FoodHistoryReader {
  triedIds = new Set<string>();
  pausedIds = new Set<string>();
  dishFeedback = new Map<string, DishFeedback>();
  introductions: string[] = [];
  healthState: HealthState = 'normal';
  /** Overrides `healthState` on given dates. */
  healthOn = new Map<string, HealthState>();
  async tried(_childId: string) {
    return new Set(this.triedIds);
  }
  async paused(_childId: string) {
    return new Set(this.pausedIds);
  }
  async feedback() {
    return new Map(this.dishFeedback);
  }
  async allergenIntroductions(_childId: string, from: string, to: string) {
    return this.introductions.filter((d) => d >= from && d <= to);
  }
  async health(_childId: string, date: string) {
    return this.healthOn.get(date) ?? this.healthState;
  }
  logged = new Map<string, { name: string | null; at: Date }>();
  async loggedBy(mealIds: string[]) {
    return new Map([...this.logged].filter(([id]) => mealIds.includes(id)));
  }
}

export const USER = 'u-1';
export const CHILD = 'c-1';

export function planningTestbed() {
  // 09:00 in Vietnam on 24/09/2026.
  const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
  const ids = new SequenceIds();
  const plans = new InMemoryMealPlans();
  const children = new FakeChildren();
  const catalog = new FakeCatalog();
  const history = new FakeHistory();
  history.triedIds = new Set(catalog.data.ingredients.keys());
  children.rows.set(CHILD, {
    userId: USER,
    info: { childId: CHILD, ageMonths: 8, stage: 2, avoidAllergens: [], avoidIngredients: [] },
  });
  plans.owners.set(CHILD, USER);
  const customs = new InMemoryCustomDishes();
  const dishes = new PlanningDishes(catalog, customs);
  const uow = new ImmediateUnitOfWork().track(plans, customs);
  const recipes = new RecipeService(children, dishes, history, clock);
  const regenerate = new RegenerateFutureService(plans, children, dishes, history, ids, clock);
  const dayPlans = new DayPlanService(plans, children, dishes, history, ids, clock);
  return {
    uow,
    clock,
    ids,
    plans,
    children,
    catalog,
    customs,
    dishes,
    history,
    dayPlans,
    weeks: new WeekPlanService(plans, children, dishes, history, dayPlans, clock, uow),
    recipes,
    regenerate,
    swaps: new SwapService(plans, children, dishes, history, ids, clock, uow),
    library: new LibraryService(plans, children, dishes, history, clock),
    customDishes: new CustomDishService(
      customs,
      children,
      dishes,
      history,
      plans,
      recipes,
      regenerate,
      ids,
      clock,
      uow,
    ),
    mealAccess: new MealAccessService(plans, dishes, history),
  };
}

export function snapshot(m: PlannedMeal) {
  return {
    id: m.id,
    childId: m.childId,
    date: m.date,
    slot: m.slot,
    time: m.time,
    dishId: m.dishId,
    stageId: m.stageId,
    texture: m.texture,
    portionText: m.portionText,
    status: m.status,
    newIngredientIds: [...m.newIngredientIds],
    source: m.source,
    generatedAt: m.generatedAt,
  };
}

/** A copy of the meal with some fields changed, ready for `plans.put`. */
export const changedMeal = (m: PlannedMeal, overrides: Partial<ReturnType<typeof snapshot>>) =>
  PlannedMeal.restore({ ...snapshot(m), ...overrides });
