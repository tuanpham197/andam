import type { ExposureUpdate } from '../../src/modules/meal-log/domain/meal-log.js';
import { MealLog } from '../../src/modules/meal-log/domain/meal-log.js';
import { MealLoggedTwiceError } from '../../src/modules/meal-log/domain/errors.js';
import type { LoggableMeals } from '../../src/modules/meal-log/application/ports/out/loggable-meals.port.js';
import type { MealLogRepository } from '../../src/modules/meal-log/application/ports/out/meal-log.repository.js';
import type { ReactionSafety } from '../../src/modules/meal-log/application/ports/out/reaction-safety.port.js';
import { LogMealService } from '../../src/modules/meal-log/application/use-cases/log-meal.service.js';
import { UrgentEvent } from '../../src/modules/safety/domain/urgent-event.js';
import type {
  ActivePause,
  NewPause,
  PausedIngredientRepository,
} from '../../src/modules/safety/application/ports/out/paused-ingredient.repository.js';
import type { SafetyContext } from '../../src/modules/safety/application/ports/out/safety-context.port.js';
import type { UrgentEventRepository } from '../../src/modules/safety/application/ports/out/urgent-event.repository.js';
import { PauseService } from '../../src/modules/safety/application/use-cases/pause.service.js';
import { PausedIngredientsService } from '../../src/modules/safety/application/use-cases/paused-ingredients.service.js';
import { UrgentService } from '../../src/modules/safety/application/use-cases/urgent.service.js';
import { RecordingEventBus, type Snapshotable } from './kernel.js';
import { CHILD, planningTestbed } from './meal-planning.js';

const copyLog = (log: MealLog) =>
  MealLog.restore({
    id: log.id,
    mealId: log.mealId,
    childId: log.childId,
    dishId: log.dishId,
    loggedAt: log.loggedAt,
    amount: log.amount,
    liking: log.liking,
    reaction: log.reaction,
    actorId: log.actorId,
  });

interface Exposure {
  childId: string;
  ingredientId: string;
  firstAt: Date;
  lastAt: Date;
  tried: boolean;
}

export class InMemoryMealLogs implements MealLogRepository, Snapshotable {
  logs: MealLog[] = [];
  exposures: Exposure[] = [];
  names = new Map<string, string | null>();
  async whoLogged(mealId: string) {
    const log = this.logs.find((l) => l.mealId === mealId);
    if (!log) return null;
    return {
      name: log.actorId === null ? null : (this.names.get(log.actorId) ?? log.actorId),
      at: log.loggedAt,
    };
  }
  async findByMeal(mealId: string) {
    const log = this.logs.find((l) => l.mealId === mealId);
    return log ? copyLog(log) : null;
  }
  async add(log: MealLog) {
    if (this.logs.some((l) => l.mealId === log.mealId)) throw new MealLoggedTwiceError();
    this.logs.push(copyLog(log));
  }
  async recordExposures(childId: string, updates: ExposureUpdate[]) {
    for (const u of updates) {
      const row = this.exposures.find(
        (e) => e.childId === childId && e.ingredientId === u.ingredientId,
      );
      if (!row) {
        this.exposures.push({
          childId,
          ingredientId: u.ingredientId,
          firstAt: u.at,
          lastAt: u.at,
          tried: u.tried,
        });
      } else {
        row.lastAt = u.at > row.lastAt ? u.at : row.lastAt;
        row.tried ||= u.tried;
      }
    }
  }
  snapshot() {
    return { logs: this.logs.map(copyLog), exposures: this.exposures.map((e) => ({ ...e })) };
  }
  restore(state: unknown) {
    ({ logs: this.logs, exposures: this.exposures } = state as ReturnType<
      InMemoryMealLogs['snapshot']
    >);
  }
}

interface PauseRow extends NewPause {
  resumedAt: Date | null;
  resumedBy: string | null;
}

export class InMemoryPauses implements PausedIngredientRepository, Snapshotable {
  rows: PauseRow[] = [];
  constructor(private readonly names: (id: string) => string) {}
  async activeIds(childId: string) {
    return new Set(
      this.rows.filter((r) => r.childId === childId && !r.resumedAt).map((r) => r.ingredientId),
    );
  }
  async add(pauses: NewPause[]) {
    for (const p of pauses) {
      if (
        this.rows.some(
          (r) => r.childId === p.childId && r.ingredientId === p.ingredientId && !r.resumedAt,
        )
      ) {
        throw new Error('unique violation: paused_ingredients_active_key');
      }
      this.rows.push({ ...p, resumedAt: null, resumedBy: null });
    }
  }
  async listActive(childId: string): Promise<ActivePause[]> {
    return this.rows
      .filter((r) => r.childId === childId && !r.resumedAt)
      .map((r) => ({
        id: r.id,
        ingredientId: r.ingredientId,
        name: this.names(r.ingredientId),
        reason: r.reason,
        pausedAt: r.pausedAt,
        meal: null,
      }));
  }
  async resume(childId: string, ingredientId: string, at: Date, actorId: string) {
    const row = this.rows.find(
      (r) => r.childId === childId && r.ingredientId === ingredientId && !r.resumedAt,
    );
    if (!row) return false;
    row.resumedAt = at;
    row.resumedBy = actorId;
    return true;
  }
  snapshot() {
    return this.rows.map((r) => ({ ...r }));
  }
  restore(state: unknown) {
    this.rows = state as PauseRow[];
  }
}

const copyEvent = (e: UrgentEvent) =>
  UrgentEvent.restore({
    id: e.id,
    childId: e.childId,
    mealId: e.mealId,
    openedAt: e.openedAt,
    contactedMedicalAt: e.contactedMedicalAt,
    actorId: e.actorId,
  });

export class InMemoryUrgentEvents implements UrgentEventRepository, Snapshotable {
  rows: UrgentEvent[] = [];
  async add(event: UrgentEvent) {
    this.rows.push(copyEvent(event));
  }
  async find(eventId: string) {
    const e = this.rows.find((r) => r.id === eventId);
    return e ? copyEvent(e) : null;
  }
  async save(event: UrgentEvent) {
    this.rows = this.rows.map((r) => (r.id === event.id ? copyEvent(event) : r));
  }
  snapshot() {
    return this.rows.map(copyEvent);
  }
  restore(state: unknown) {
    this.rows = state as UrgentEvent[];
  }
}

/**
 * Planning, logging and safety wired together in memory the way the modules are in the app:
 * the history the planner reads is what logs and pauses wrote, events replan in the same "transaction".
 */
export function careTestbed() {
  const p = planningTestbed();
  const name = (id: string) => p.catalog.data.ingredients.get(id)?.name ?? id;
  const logs = new InMemoryMealLogs();
  const pauses = new InMemoryPauses(name);
  const urgents = new InMemoryUrgentEvents();
  p.uow.track(logs, pauses, urgents);

  p.history.paused = (childId: string) => pauses.activeIds(childId);
  const baseTried = p.history.triedIds;
  p.history.tried = async (childId: string) =>
    new Set([
      ...baseTried,
      ...logs.exposures.filter((e) => e.childId === childId && e.tried).map((e) => e.ingredientId),
    ]);

  const events = new RecordingEventBus();
  events.subscribe('IngredientsPaused', (e) => {
    const { childId, userId, sourceMealId } = e as unknown as {
      childId: string;
      userId: string;
      sourceMealId: string | null;
    };
    return p.regenerate.execute({ childId, userId, scope: 'unsafe', keepMealId: sourceMealId });
  });
  events.subscribe('IngredientResumed', (e) =>
    p.regenerate.execute({
      ...(e as unknown as { childId: string; userId: string }),
      scope: 'all',
    }),
  );

  const context: SafetyContext = {
    roleOf: async (userId, childId) => p.children.roleOf(childId, userId),
    meal: async (userId, mealId) => p.mealAccess.find(userId, mealId),
    ingredientNames: async (ids) => new Map(ids.map((id) => [id, name(id)])),
  };
  const pauseService = new PauseService(pauses, context, events, p.ids, p.clock);
  const meals: LoggableMeals = {
    find: (userId, mealId) => p.mealAccess.find(userId, mealId),
    markLogged: (userId, mealId, outcome) => p.mealAccess.markLogged(userId, mealId, outcome),
  };
  const safety: ReactionSafety = {
    pauseAfterReaction: (input) =>
      pauseService.pause({
        userId: input.userId,
        childId: input.childId,
        ingredientIds: input.ingredientIds,
        reason: 'reaction',
        sourceLogId: input.logId,
        sourceMealId: input.mealId,
      }),
  };
  return {
    ...p,
    logs,
    pauses,
    urgents,
    events,
    context,
    pauseService,
    logMeals: new LogMealService(meals, logs, safety, p.ids, p.clock, p.uow),
    urgent: new UrgentService(urgents, context, pauseService, p.ids, p.clock, p.uow),
    paused: new PausedIngredientsService(pauses, context, events, p.clock, p.uow),
  };
}

export { CHILD };
