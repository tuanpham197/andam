import type {
  ChildDto,
  CustomDishFormDto,
  DayPlanDto,
  HealthDto,
  HealthPreviewDto,
  JournalEntryDto,
  JournalPageDto,
  LogFormDto,
  MembersDto,
  LoggedMealDto,
  PausedIngredientDto,
  UrgentEventDto,
  WeekPlanDto,
  LibraryDishDto,
  LibraryDto,
  MealDto,
  RecipeDto,
  StageDto,
  SwapSuggestionsDto,
} from '@appandam/api-client';

export const NA_ID = '10000000-0000-4000-8000-000000000001';

export function childFixture(overrides: Partial<ChildDto> = {}): ChildDto {
  return {
    id: NA_ID,
    name: 'Na',
    initials: 'Na',
    birthDate: '2026-01-12',
    isPremature: false,
    weeksEarly: 0,
    priorReaction: 'never',
    priorReactionNote: null,
    avoidAllergens: ['egg'],
    avoidIngredients: [{ ingredientId: 'ing_muop_dang', name: 'Mướp đắng', reason: 'dislike' }],
    stageOverride: null,
    role: 'owner',
    age: { months: 8, days: 12, corrected: false },
    autoStage: 2,
    effectiveStage: 2,
    isOverride: false,
    plannable: true,
    notPlannableReason: null,
    stages: [
      { id: 1, state: 'open', unlockAtMonths: 6 },
      { id: 2, state: 'selected', unlockAtMonths: 8 },
      { id: 3, state: 'locked', unlockAtMonths: 10 },
      { id: 4, state: 'locked', unlockAtMonths: 12 },
    ],
    ...overrides,
  };
}

export const STAGES: StageDto[] = [
  {
    id: 1,
    name: 'Giai đoạn 1',
    ageFromMonths: 6,
    ageToMonths: 8,
    texture: 'puree_smooth',
    portionText: '2–3 thìa, tăng dần',
    mainMeals: 2,
    snacksMin: 0,
    snacksMax: 0,
  },
  {
    id: 2,
    name: 'Giai đoạn 2',
    ageFromMonths: 8,
    ageToMonths: 10,
    texture: 'lumpy',
    portionText: 'Khoảng 125 ml',
    mainMeals: 3,
    snacksMin: 1,
    snacksMax: 1,
  },
  {
    id: 3,
    name: 'Giai đoạn 3',
    ageFromMonths: 10,
    ageToMonths: 12,
    texture: 'minced_soft',
    portionText: 'Khoảng 125 ml',
    mainMeals: 3,
    snacksMin: 1,
    snacksMax: 2,
  },
  {
    id: 4,
    name: 'Giai đoạn 4',
    ageFromMonths: 12,
    ageToMonths: 24,
    texture: 'family',
    portionText: '175–250 ml',
    mainMeals: 3,
    snacksMin: 1,
    snacksMax: 2,
  },
];

export const LUNCH_ID = '20000000-0000-4000-8000-000000000002';

export function mealFixture(overrides: Partial<MealDto> = {}): MealDto {
  return {
    id: LUNCH_ID,
    slot: 'lunch',
    time: '11:00',
    status: 'planned',
    texture: 'lumpy',
    portionText: '120–150 ml tham khảo',
    loggedBy: null,
    dish: {
      id: 'dish_chao_ca_hoi_rau_ngot',
      name: 'Cháo cá hồi rau ngót',
      prepMin: 10,
      cookMin: 15,
      mainProtein: 'fish',
      foodGroups: ['carb', 'protein', 'fat', 'veg'],
      custom: false,
    },
    newIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }],
    ...overrides,
  };
}

/** The design's day: breakfast eaten, lunch next, a pear snack, chicken for dinner. */
export function dayFixture(overrides: Partial<DayPlanDto> = {}): DayPlanDto {
  return {
    date: '2026-09-24',
    plannable: true,
    meals: [
      mealFixture({
        id: '20000000-0000-4000-8000-000000000001',
        slot: 'breakfast',
        time: '07:30',
        status: 'eaten',
        dish: {
          id: 'dish_bot_yen_mach_chuoi',
          name: 'Bột yến mạch chuối',
          prepMin: 5,
          cookMin: 10,
          mainProtein: null,
          foodGroups: ['carb', 'veg'],
          custom: false,
        },
        newIngredients: [],
      }),
      mealFixture(),
      mealFixture({
        id: '20000000-0000-4000-8000-000000000003',
        slot: 'afternoon_snack',
        time: '15:00',
        dish: {
          id: 'dish_le_hap_nghien',
          name: 'Lê hấp nghiền',
          prepMin: 3,
          cookMin: 7,
          mainProtein: null,
          foodGroups: ['veg'],
          custom: false,
        },
        newIngredients: [],
      }),
      mealFixture({
        id: '20000000-0000-4000-8000-000000000004',
        slot: 'dinner',
        time: '18:00',
        dish: {
          id: 'dish_chao_ga_bi_do',
          name: 'Cháo thịt gà bí đỏ',
          prepMin: 10,
          cookMin: 20,
          mainProtein: 'chicken',
          foodGroups: ['carb', 'protein', 'fat', 'veg'],
          custom: false,
        },
        newIngredients: [],
      }),
    ],
    unfilledSlots: [],
    nextMealId: LUNCH_ID,
    ...overrides,
  };
}

export function recipeFixture(overrides: Partial<RecipeDto> = {}): RecipeDto {
  return {
    id: 'dish_chao_ca_hoi_rau_ngot',
    name: 'Cháo cá hồi rau ngót',
    description: 'Cháo gạo tẻ nấu nhừ với cá hồi hấp tách xương và rau ngót băm nhỏ.',
    imageUrl: null,
    mealType: 'main',
    prepMin: 10,
    cookMin: 15,
    tool: 'Nồi',
    contentVersion: 3,
    reviewedBy: 'BS. Lan',
    stages: [1, 2, 3],
    selectedStage: 2,
    variants: [
      { stage: 1, texture: 'puree_smooth', portionText: '2–3 thìa, tăng dần', portionMl: null },
      { stage: 2, texture: 'lumpy', portionText: '120–150 ml tham khảo', portionMl: 135 },
      { stage: 3, texture: 'minced_soft', portionText: 'Khoảng 125 ml', portionMl: 125 },
    ],
    ingredients: [
      ingredient('ing_gao_te', 'Gạo tẻ', 20, 'g', 'carb'),
      {
        ...ingredient('ing_ca_hoi', 'Cá hồi phi lê', 25, 'g', 'protein'),
        allergenTags: ['fish'],
        isMain: true,
      },
      { ...ingredient('ing_rau_ngot', 'Rau ngót', 15, 'g', 'veg'), isNew: true },
      ingredient('ing_dau_an_dam', 'Dầu ăn dặm', 5, 'ml', 'fat'),
    ],
    steps: [
      'Vo gạo, nấu cháo với nước đến khi hạt gạo nở nhừ.',
      'Hấp chín cá hồi, gỡ xương, dầm nhỏ.',
      'Cho cá và rau ngót băm vào cháo, nấu thêm 3–5 phút, thêm dầu khi tắt bếp.',
    ],
    safetyNotes: [
      'Gỡ và kiểm tra kỹ xương cá trước khi nghiền.',
      'Không thêm muối, nước mắm hay đường cho bé dưới 1 tuổi.',
    ],
    allergens: ['fish'],
    foodGroups: ['carb', 'protein', 'fat', 'veg'],
    custom: false,
    exclusion: null,
    ...overrides,
  };
}

function ingredient(
  ingredientId: string,
  name: string,
  qty: number,
  unit: string,
  foodGroup: RecipeDto['ingredients'][number]['foodGroup'],
): RecipeDto['ingredients'][number] {
  return {
    ingredientId,
    name,
    qty,
    unit,
    isMain: false,
    foodGroup,
    allergenTags: [],
    isNew: false,
  };
}

const NO_EXCLUSIONS = { allergen: 0, avoid: 0, paused: 0, age: 0, refused: 0, sick_new: 0 };

/** The design's S02: lunch salmon porridge, the beef one fits best, a fish one only by relaxing. */
export function swapFixture(overrides: Partial<SwapSuggestionsDto> = {}): SwapSuggestionsDto {
  return {
    meal: {
      id: LUNCH_ID,
      slot: 'lunch',
      time: '11:00',
      dish: { id: 'dish_chao_ca_hoi_rau_ngot', name: 'Cháo cá hồi rau ngót' },
    },
    reason: 'missing_ingredient',
    ranked: [
      {
        dish: {
          id: 'dish_chao_bo_cai_bo_xoi',
          name: 'Cháo thịt bò cải bó xôi',
          prepMin: 5,
          cookMin: 15,
          mainProtein: 'beef',
          foodGroups: ['carb', 'protein', 'fat', 'veg'],
          custom: false,
        },
        texture: 'lumpy',
        portionText: '120–150 ml',
        newIngredients: [],
        reasons: ['NOT_USED_7D', 'DIFFERENT_PROTEIN', 'LIKED'],
        fasterByMin: 5,
        repeatInDays: null,
      },
      {
        dish: {
          id: 'dish_sup_khoai_lang_dau_ha_lan',
          name: 'Súp khoai lang đậu Hà Lan',
          prepMin: 5,
          cookMin: 10,
          mainProtein: 'legume',
          foodGroups: ['carb', 'protein', 'veg'],
          custom: false,
        },
        texture: 'mashed',
        portionText: '120–150 ml',
        newIngredients: [],
        reasons: ['NOT_USED_7D'],
        fasterByMin: 10,
        repeatInDays: null,
      },
      {
        dish: {
          id: 'dish_chao_ca_loc_bi_xanh',
          name: 'Cháo cá lóc bí xanh',
          prepMin: 10,
          cookMin: 15,
          mainProtein: 'fish',
          foodGroups: ['carb', 'protein', 'fat', 'veg'],
          custom: false,
        },
        texture: 'lumpy',
        portionText: '120–150 ml',
        newIngredients: [],
        reasons: ['FOUR_GROUPS'],
        fasterByMin: 0,
        repeatInDays: -4,
      },
    ],
    otherMains: [
      { slot: 'breakfast', protein: 'chicken' },
      { slot: 'dinner', protein: 'chicken' },
    ],
    excluded: { total: 6, byReason: { ...NO_EXCLUSIONS, allergen: 3, age: 2, refused: 1 } },
    relaxedWindowDays: 3,
    ...overrides,
  };
}

export function libraryDish(overrides: Partial<LibraryDishDto> = {}): LibraryDishDto {
  return {
    id: 'dish_chao_ca_hoi_rau_ngot',
    name: 'Cháo cá hồi rau ngót',
    prepMin: 10,
    cookMin: 15,
    mainProtein: 'fish',
    foodGroups: ['carb', 'protein', 'fat', 'veg'],
    custom: false,
    mealType: 'main',
    texture: 'lumpy',
    newIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }],
    liked: false,
    lastEaten: null,
    ...overrides,
  };
}

/** A slice of the design's S05 grid, egg dishes hidden for bé Na. */
export function libraryFixture(overrides: Partial<LibraryDto> = {}): LibraryDto {
  return {
    dishes: [
      libraryDish(),
      libraryDish({
        id: 'dish_chao_ga_bi_do',
        name: 'Cháo thịt gà bí đỏ',
        prepMin: 10,
        cookMin: 20,
        mainProtein: 'chicken',
        newIngredients: [],
        liked: true,
        lastEaten: { daysAgo: 2, slot: 'lunch' },
      }),
      libraryDish({
        id: 'dish_bot_yen_mach_chuoi',
        name: 'Bột yến mạch chuối',
        prepMin: 5,
        cookMin: 5,
        mainProtein: null,
        foodGroups: ['carb', 'veg'],
        custom: false,
        mealType: 'snack',
        texture: 'mashed',
        newIngredients: [],
        lastEaten: { daysAgo: 0, slot: 'breakfast' },
      }),
    ],
    hidden: {
      total: 5,
      byReason: { ...NO_EXCLUSIONS, allergen: 3, age: 2 },
      items: [
        { dishId: 'dish_chao_trung', name: 'Cháo trứng cà rốt', reason: 'allergen' },
        { dishId: 'dish_trung_hap', name: 'Trứng hấp rau', reason: 'allergen' },
        { dishId: 'dish_banh_trung', name: 'Bánh trứng sữa', reason: 'allergen' },
        { dishId: 'dish_com_nat', name: 'Cơm nát cá', reason: 'age' },
        { dishId: 'dish_mi_ga', name: 'Mì gà cắt nhỏ', reason: 'age' },
      ],
    },
    ...overrides,
  };
}

/** S07 for today's lunch: salmon porridge, with rau ngót tried for the first time. */
export function logFormFixture(overrides: Partial<LogFormDto> = {}): LogFormDto {
  return {
    meal: {
      id: LUNCH_ID,
      date: '2026-09-24',
      slot: 'lunch',
      time: '11:00',
      status: 'planned',
      dish: { id: 'dish_chao_ca_hoi_rau_ngot', name: 'Cháo cá hồi rau ngót', custom: false },
    },
    firstTryIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }],
    suspectIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }],
    log: null,
    ...overrides,
  };
}

export function loggedFixture(overrides: Partial<LoggedMealDto> = {}): LoggedMealDto {
  return {
    log: {
      id: '30000000-0000-4000-8000-000000000001',
      mealId: LUNCH_ID,
      loggedAt: '2026-09-24T04:40:00.000Z',
      loggedBy: 'Mẹ Na',
      amount: 'half',
      liking: 3,
      outcome: 'eaten',
      reaction: null,
    },
    pausedIngredients: [],
    ...overrides,
  };
}

export const URGENT_ID = '40000000-0000-4000-8000-000000000001';

export function urgentFixture(overrides: Partial<UrgentEventDto> = {}): UrgentEventDto {
  return {
    id: URGENT_ID,
    mealId: LUNCH_ID,
    openedAt: '2026-09-24T04:45:00.000Z',
    contactedMedicalAt: null,
    pausedIngredients: [
      { id: 'ing_ca_hoi', name: 'Cá hồi' },
      { id: 'ing_rau_ngot', name: 'Rau ngót' },
    ],
    ...overrides,
  };
}

export function pausedFixture(overrides: Partial<PausedIngredientDto> = {}): PausedIngredientDto {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    ingredientId: 'ing_rau_ngot',
    name: 'Rau ngót',
    reason: 'reaction',
    pausedAt: '2026-09-24T04:45:00.000Z',
    meal: { date: '2026-09-24', slot: 'lunch', dishName: 'Cháo cá hồi rau ngót' },
    ...overrides,
  };
}

export function journalEntry(overrides: Partial<JournalEntryDto> = {}): JournalEntryDto {
  return {
    kind: 'meal',
    id: '30000000-0000-4000-8000-000000000001',
    at: '2026-09-24T04:40:00.000Z',
    date: '2026-09-24',
    slot: 'lunch',
    dish: { id: 'dish_chao_ca_hoi_rau_ngot', name: 'Cháo cá hồi rau ngót', custom: false },
    amount: 'half',
    liking: 3,
    reaction: null,
    contactedMedicalAt: null,
    pausedIngredients: [],
    actorName: 'Mẹ Na',
    ...overrides,
  };
}

export function journalFixture(overrides: Partial<JournalPageDto> = {}): JournalPageDto {
  return { entries: [journalEntry()], nextCursor: null, ...overrides };
}

export const CUSTOM_ID = 'custom_60000000-0000-4000-8000-000000000001';

export function customDishFormFixture(
  overrides: Partial<CustomDishFormDto> = {},
): CustomDishFormDto {
  return {
    id: CUSTOM_ID,
    name: 'Cháo gà bí đỏ nhà làm',
    mealType: 'main',
    ingredients: [
      { id: 'ing_gao_te', name: 'Gạo tẻ', foodGroup: 'carb', qty: null, unit: null },
      { id: 'ing_thit_ga', name: 'Thịt gà', foodGroup: 'protein', qty: 30, unit: 'g' },
    ],
    prepMin: 10,
    cookMin: 20,
    steps: ['Vo gạo', 'Nấu cháo'],
    ...overrides,
  };
}

export const MOM_ID = '00000000-0000-4000-8000-000000000001';
export const DAD_ID = '00000000-0000-4000-8000-000000000002';

export function membersFixture(overrides: Partial<MembersDto> = {}): MembersDto {
  return {
    members: [
      {
        userId: MOM_ID,
        displayName: 'Mẹ Na',
        email: 'me.na@example.vn',
        role: 'owner',
        joinedAt: '2026-09-01T02:00:00.000Z',
        isMe: true,
      },
      {
        userId: DAD_ID,
        displayName: 'Ba',
        email: 'ba.na@example.vn',
        role: 'caregiver',
        joinedAt: '2026-09-20T02:00:00.000Z',
        isMe: false,
      },
    ],
    pendingInvites: [],
    ...overrides,
  };
}

export function healthFixture(overrides: Partial<HealthDto> = {}): HealthDto {
  return {
    status: 'normal',
    symptoms: [],
    startDate: null,
    expectedEndDate: null,
    overdue: false,
    ...overrides,
  };
}

export function healthPreviewFixture(status: HealthPreviewDto['status']): HealthPreviewDto {
  const adjustments = {
    normal: { extraSnacks: 0, portionPercent: 100, softerTexture: 0, pauseNewFoods: false },
    sick: { extraSnacks: 1, portionPercent: 70, softerTexture: 1, pauseNewFoods: true },
    recovering: { extraSnacks: 0, portionPercent: 85, softerTexture: 0, pauseNewFoods: true },
  } as const;
  return { status, ...adjustments[status] };
}

const WEEK_DISHES = [
  'Cháo gà cà rốt',
  'Cháo cá lóc bí xanh',
  'Cháo bò khoai tây',
  'Cháo cá hồi rau ngót',
  'Cháo thịt heo cải bó xôi',
  'Súp khoai lang đậu Hà Lan',
  'Cháo bò bí đỏ',
];

/** Bé Na’s week of 21–27/9 as on design S04 (Thursday 24 is today). */
export function weekFixture(overrides: Partial<WeekPlanDto> = {}): WeekPlanDto {
  const days = WEEK_DISHES.map((name, i) => {
    const date = `2026-09-${String(21 + i).padStart(2, '0')}`;
    return {
      date,
      groupsCovered: i === 2 ? 3 : 4,
      meals: [
        mealFixture({
          id: `30000000-0000-4000-8000-00000000000${i}`,
          dish: { ...mealFixture().dish, id: `dish_${i}`, name },
          newIngredients: i === 5 ? [{ id: 'ing_dau_ha_lan', name: 'Đậu Hà Lan' }] : [],
        }),
      ],
    };
  });
  return {
    weekStart: '2026-09-21',
    plannable: true,
    days,
    stats: {
      distinctDishes: 19,
      totalMeals: 28,
      daysFullGroups: 6,
      proteinRotation: [
        { protein: 'fish', meals: 3, avoided: false },
        { protein: 'chicken', meals: 3, avoided: false },
        { protein: 'beef', meals: 2, avoided: false },
        { protein: 'pork', meals: 2, avoided: false },
        { protein: 'legume', meals: 2, avoided: false },
        { protein: 'egg', meals: 0, avoided: true },
      ],
    },
    ...overrides,
  };
}
