import {
  compareDates,
  isValidLocalDate,
  type LocalDate,
} from '../../../shared/kernel/local-date.js';
import {
  STAGE_OPENS_AT,
  planningAge,
  stageForAge,
  type BirthInfo,
  type NotPlannableReason,
  type StageId,
} from './age.js';
import {
  ChildNotPlannableError,
  ChildTooOldError,
  InvalidBirthDateError,
  InvalidChildNameError,
  InvalidPriorReactionNoteError,
  InvalidStageError,
  InvalidWeeksEarlyError,
  StageAboveAgeError,
  TooManyAvoidItemsError,
} from './errors.js';

export const ALLERGENS = [
  'egg',
  'cow_milk',
  'peanut',
  'shellfish',
  'fish',
  'wheat',
  'soy',
  'sesame',
  'tree_nut',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
export type AvoidReason = 'not_eat' | 'dislike';
export type PriorReaction = 'never' | 'yes' | 'unsure';

export interface AvoidIngredient {
  ingredientId: string;
  reason: AvoidReason;
}

const MAX_NAME = 30;
const MAX_NOTE = 500;
const MAX_AVOID_INGREDIENTS = 100;
const MAX_WEEKS_EARLY = 16;

const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });
const graphemes = (value: string) => [...segmenter.segment(value)].map((s) => s.segment);

function normalizeName(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const length = graphemes(name).length;
  if (length < 1 || length > MAX_NAME) throw new InvalidChildNameError();
  return name;
}

function normalizeBirth(birth: BirthInfo, today: LocalDate): BirthInfo {
  if (!isValidLocalDate(birth.birthDate) || compareDates(birth.birthDate, today) > 0) {
    throw new InvalidBirthDateError();
  }
  if (
    birth.isPremature &&
    (!Number.isInteger(birth.weeksEarly) ||
      birth.weeksEarly < 1 ||
      birth.weeksEarly > MAX_WEEKS_EARLY)
  ) {
    throw new InvalidWeeksEarlyError();
  }
  const normalized: BirthInfo = {
    birthDate: birth.birthDate,
    isPremature: birth.isPremature,
    weeksEarly: birth.isPremature ? birth.weeksEarly : 0,
  };
  if (stageForAge(planningAge(normalized, today)).notPlannableReason === 'too_old') {
    throw new ChildTooOldError();
  }
  return normalized;
}

function normalizeNote(kind: PriorReaction, note: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  if (kind !== 'yes' || trimmed.length === 0) return null;
  if (trimmed.length > MAX_NOTE) throw new InvalidPriorReactionNoteError();
  return trimmed;
}

function normalizeAvoidIngredients(items: AvoidIngredient[]): AvoidIngredient[] {
  const byId = new Map<string, AvoidReason>();
  for (const { ingredientId, reason } of items) {
    byId.set(ingredientId, byId.get(ingredientId) === 'not_eat' ? 'not_eat' : reason);
  }
  if (byId.size > MAX_AVOID_INGREDIENTS) throw new TooManyAvoidItemsError();
  return [...byId].map(([ingredientId, reason]) => ({ ingredientId, reason }));
}

export interface CreateChildInput extends BirthInfo {
  id: string;
  userId: string;
  name: string;
  priorReaction: PriorReaction;
  priorReactionNote: string | null;
  avoidAllergens: Allergen[];
  avoidIngredients: AvoidIngredient[];
}

interface ChildState extends Omit<CreateChildInput, 'name'> {
  name: string;
  stageOverride: number | null;
  createdAt: Date;
}

export type StageState = 'selected' | 'open' | 'locked';

export interface ChildProfile {
  age: { months: number; days: number; corrected: boolean };
  autoStage: StageId | null;
  effectiveStage: StageId | null;
  isOverride: boolean;
  plannable: boolean;
  notPlannableReason: NotPlannableReason | null;
  stages: { id: StageId; state: StageState; unlockAtMonths: number }[];
}

export class Child {
  private constructor(private state: ChildState) {}

  static create(input: CreateChildInput, today: LocalDate, createdAt: Date): Child {
    const birth = normalizeBirth(input, today);
    return new Child({
      ...input,
      ...birth,
      name: normalizeName(input.name),
      priorReactionNote: normalizeNote(input.priorReaction, input.priorReactionNote),
      avoidAllergens: [...new Set(input.avoidAllergens)],
      avoidIngredients: normalizeAvoidIngredients(input.avoidIngredients),
      stageOverride: null,
      createdAt,
    });
  }

  static restore(state: ChildState): Child {
    return new Child({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get userId() {
    return this.state.userId;
  }
  get name() {
    return this.state.name;
  }
  get birthDate() {
    return this.state.birthDate;
  }
  get isPremature() {
    return this.state.isPremature;
  }
  get weeksEarly() {
    return this.state.weeksEarly;
  }
  get stageOverride() {
    return this.state.stageOverride;
  }
  get priorReaction() {
    return this.state.priorReaction;
  }
  get priorReactionNote() {
    return this.state.priorReactionNote;
  }
  get avoidAllergens() {
    return this.state.avoidAllergens;
  }
  get avoidIngredients() {
    return this.state.avoidIngredients;
  }
  get createdAt() {
    return this.state.createdAt;
  }

  /** Avatar letters: two first letters of a single name, else initials of the last two words. */
  get initials(): string {
    const words = this.state.name.split(' ');
    if (words.length === 1) {
      const [first = '', second = ''] = graphemes(words[0]!);
      return first.toUpperCase() + second;
    }
    return words
      .slice(-2)
      .map((word) => graphemes(word)[0]!.toUpperCase())
      .join('');
  }

  rename(name: string): void {
    this.state.name = normalizeName(name);
  }

  changeBirth(birth: BirthInfo, today: LocalDate): void {
    const next = normalizeBirth(birth, today);
    const prematureToggled = next.isPremature !== this.state.isPremature;
    Object.assign(this.state, next);
    const auto = stageForAge(planningAge(next, today)).stage;
    if (
      prematureToggled ||
      this.state.stageOverride === null ||
      auto === null ||
      this.state.stageOverride > auto
    ) {
      this.state.stageOverride = null;
    }
  }

  setStageOverride(stage: number | null, today: LocalDate): void {
    if (stage === null) {
      this.state.stageOverride = null;
      return;
    }
    if (!Number.isInteger(stage) || stage < 1 || stage > 4) throw new InvalidStageError();
    const auto = stageForAge(planningAge(this.state, today)).stage;
    if (auto === null) throw new ChildNotPlannableError();
    if (stage > auto) throw new StageAboveAgeError();
    this.state.stageOverride = stage === auto ? null : stage;
  }

  setPriorReaction(kind: PriorReaction, note: string | null): void {
    this.state.priorReaction = kind;
    this.state.priorReactionNote = normalizeNote(kind, note);
  }

  replaceAvoidList(allergens: Allergen[], ingredients: AvoidIngredient[]): void {
    this.state.avoidIngredients = normalizeAvoidIngredients(ingredients);
    this.state.avoidAllergens = [...new Set(allergens)];
  }

  profile(today: LocalDate): ChildProfile {
    const age = planningAge(this.state, today);
    const { stage: autoStage, notPlannableReason } = stageForAge(age);
    const override = this.state.stageOverride;
    // An override persisted earlier stays only while it is not above the current age (BR-12).
    const isOverride = autoStage !== null && override !== null && override < autoStage;
    const effectiveStage =
      autoStage === null ? null : isOverride ? (override as StageId) : autoStage;

    const stages = ([1, 2, 3, 4] as const).map((id) => ({
      id,
      unlockAtMonths: STAGE_OPENS_AT[id],
      state: (id === effectiveStage
        ? 'selected'
        : autoStage !== null && id <= autoStage
          ? 'open'
          : 'locked') as StageState,
    }));

    return {
      age,
      autoStage,
      effectiveStage,
      isOverride,
      plannable: autoStage !== null,
      notPlannableReason,
      stages,
    };
  }
}
