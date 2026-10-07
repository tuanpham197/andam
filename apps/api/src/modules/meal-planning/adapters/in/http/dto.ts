import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LIBRARY_CHIPS, type LibraryChip } from '../../../domain/library.js';
import { SWAP_REASONS, type SwapReason } from '../../../domain/swap.js';

const SLOTS = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'extra_snack'];
const STATUSES = ['planned', 'prepared', 'eaten', 'refused', 'skipped'];
const TEXTURES = ['puree_smooth', 'mashed', 'lumpy', 'minced_soft', 'family'];
const PROTEINS = ['fish', 'chicken', 'beef', 'pork', 'legume', 'egg'];
const GROUPS = ['carb', 'protein', 'fat', 'veg'];
const ALLERGENS = [
  'egg',
  'cow_milk',
  'peanut',
  'shellfish',
  'fish',
  'wheat',
  'soy',
  'sesame',
  'tree_nut',
];
const EXCLUSIONS = ['allergen', 'avoid', 'paused', 'age', 'refused', 'sick_new'];
const REASON_CODES = [
  'FASTER',
  'NOT_USED_7D',
  'DIFFERENT_PROTEIN',
  'LIKED',
  'FOUR_GROUPS',
  'LEAST_USED_PROTEIN',
  'NEW_INGREDIENT',
];

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class UpdateMealDto {
  @ApiProperty({ enum: ['prepared'], description: 'Chỉ cho phép đánh dấu đã chuẩn bị (FR-025)' })
  @IsIn(['prepared'])
  status: 'prepared';
}

export class RecipeQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  stage?: number;
}

class NamedIngredientDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class MealDishDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() prepMin: number;
  @ApiProperty() cookMin: number;
  @ApiProperty({ enum: PROTEINS, nullable: true, type: String }) mainProtein: string | null;
  @ApiProperty({ enum: GROUPS, isArray: true }) foodGroups: string[];
}

export class MealDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: SLOTS }) slot: string;
  @ApiProperty({ example: '11:00' }) time: string;
  @ApiProperty({ enum: STATUSES }) status: string;
  @ApiProperty({ enum: TEXTURES }) texture: string;
  @ApiProperty() portionText: string;
  @ApiProperty({ type: MealDishDto }) dish: MealDishDto;
  @ApiProperty({ type: [NamedIngredientDto] }) newIngredients: NamedIngredientDto[];
}

class SlotDto {
  @ApiProperty({ enum: SLOTS }) slot: string;
  @ApiProperty() time: string;
}

export class DayPlanDto {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty() plannable: boolean;
  @ApiProperty({ type: [MealDto] }) meals: MealDto[];
  @ApiProperty({ type: [SlotDto], description: 'Bữa chưa tìm được món an toàn' })
  unfilledSlots: SlotDto[];
  @ApiProperty({ nullable: true, type: String }) nextMealId: string | null;
}

export class MealStatusDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: STATUSES }) status: string;
}

class RecipeVariantDto {
  @ApiProperty() stage: number;
  @ApiProperty({ enum: TEXTURES }) texture: string;
  @ApiProperty() portionText: string;
  @ApiProperty({ nullable: true, type: Number }) portionMl: number | null;
}

class RecipeIngredientDto {
  @ApiProperty() ingredientId: string;
  @ApiProperty() name: string;
  @ApiProperty() qty: number;
  @ApiProperty() unit: string;
  @ApiProperty() isMain: boolean;
  @ApiProperty({ enum: ['carb', 'protein', 'fat', 'veg', 'fruit', 'seasoning'] }) foodGroup: string;
  @ApiProperty({ enum: ALLERGENS, isArray: true }) allergenTags: string[];
  @ApiProperty({ description: 'Bé chưa từng ăn' }) isNew: boolean;
}

export class RecipeDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty({ nullable: true, type: String }) imageUrl: string | null;
  @ApiProperty({ enum: ['main', 'snack'] }) mealType: string;
  @ApiProperty() prepMin: number;
  @ApiProperty() cookMin: number;
  @ApiProperty() tool: string;
  @ApiProperty() contentVersion: number;
  @ApiProperty({ nullable: true, type: String }) reviewedBy: string | null;
  @ApiProperty({ type: [Number] }) stages: number[];
  @ApiProperty() selectedStage: number;
  @ApiProperty({ type: [RecipeVariantDto] }) variants: RecipeVariantDto[];
  @ApiProperty({ type: [RecipeIngredientDto] }) ingredients: RecipeIngredientDto[];
  @ApiProperty({ type: [String] }) steps: string[];
  @ApiProperty({ type: [String] }) safetyNotes: string[];
  @ApiProperty({ enum: ALLERGENS, isArray: true }) allergens: string[];
  @ApiProperty({ enum: GROUPS, isArray: true }) foodGroups: string[];
  @ApiProperty({ enum: EXCLUSIONS, nullable: true, type: String }) exclusion: string | null;
}

export class SwapQueryDto {
  @ApiPropertyOptional({ enum: SWAP_REASONS, default: 'missing_ingredient' })
  @IsOptional()
  @IsIn(SWAP_REASONS)
  reason?: SwapReason;
}

export class SwapDto {
  @ApiProperty({ example: 'dish_chao_bo_cai_bo_xoi' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  dishId: string;

  @ApiProperty({ enum: SWAP_REASONS })
  @IsIn(SWAP_REASONS)
  reason: SwapReason;
}

class ExclusionCountsDto {
  @ApiProperty() allergen: number;
  @ApiProperty() avoid: number;
  @ApiProperty() paused: number;
  @ApiProperty() age: number;
  @ApiProperty() refused: number;
  @ApiProperty() sick_new: number;
}

class SwapMealDishDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

class SwapMealDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: SLOTS }) slot: string;
  @ApiProperty() time: string;
  @ApiProperty({ type: SwapMealDishDto }) dish: SwapMealDishDto;
}

class SwapCandidateDto {
  @ApiProperty({ type: MealDishDto }) dish: MealDishDto;
  @ApiProperty({ enum: TEXTURES }) texture: string;
  @ApiProperty() portionText: string;
  @ApiProperty({ type: [NamedIngredientDto] }) newIngredients: NamedIngredientDto[];
  @ApiProperty({ enum: REASON_CODES, isArray: true, description: 'Tối đa 3, theo thứ tự hiển thị' })
  reasons: string[];
  @ApiProperty({ description: 'Số phút nhanh hơn món hiện tại (0 nếu không nhanh hơn)' })
  fasterByMin: number;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Lần dùng gần nhất trong 7 ngày: âm = N ngày trước, dương = N ngày tới',
  })
  repeatInDays: number | null;
}

class DayProteinDto {
  @ApiProperty({ enum: SLOTS }) slot: string;
  @ApiProperty({ enum: PROTEINS }) protein: string;
}

class ExclusionSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: ExclusionCountsDto }) byReason: ExclusionCountsDto;
}

export class SwapSuggestionsDto {
  @ApiProperty({ type: SwapMealDto }) meal: SwapMealDto;
  @ApiProperty({ enum: SWAP_REASONS }) reason: string;
  @ApiProperty({ type: [SwapCandidateDto], description: 'Món đầu tiên là “Phù hợp nhất”' })
  ranked: SwapCandidateDto[];
  @ApiProperty({ type: [DayProteinDto] }) otherMains: DayProteinDto[];
  @ApiProperty({ type: ExclusionSummaryDto }) excluded: ExclusionSummaryDto;
  @ApiProperty({ nullable: true, type: Number, enum: [3] }) relaxedWindowDays: number | null;
}

export class LibraryQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Tên món hoặc nguyên liệu, không cần dấu' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: LIBRARY_CHIPS, default: 'all' })
  @IsOptional()
  @IsIn(LIBRARY_CHIPS)
  chip?: LibraryChip;

  @ApiPropertyOptional({ description: 'Chỉ món chưa ăn trong 7 ngày' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  fresh?: boolean;
}

class LastEatenDto {
  @ApiProperty() daysAgo: number;
  @ApiProperty({ enum: SLOTS }) slot: string;
}

class LibraryDishDto extends MealDishDto {
  @ApiProperty({ enum: ['main', 'snack'] }) mealType: string;
  @ApiProperty({ enum: TEXTURES }) texture: string;
  @ApiProperty({ type: [NamedIngredientDto] }) newIngredients: NamedIngredientDto[];
  @ApiProperty() liked: boolean;
  @ApiProperty({ type: LastEatenDto, nullable: true }) lastEaten: LastEatenDto | null;
}

class HiddenDishDto {
  @ApiProperty() dishId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: EXCLUSIONS }) reason: string;
}

class HiddenDishesDto extends ExclusionSummaryDto {
  @ApiProperty({ type: [HiddenDishDto] }) items: HiddenDishDto[];
}

export class LibraryDto {
  @ApiProperty({ type: [LibraryDishDto] }) dishes: LibraryDishDto[];
  @ApiProperty({ type: HiddenDishesDto, description: 'Món khớp bộ lọc nhưng không an toàn cho bé' })
  hidden: HiddenDishesDto;
}
