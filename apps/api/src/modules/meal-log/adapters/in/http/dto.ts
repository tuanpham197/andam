import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EAT_AMOUNTS, SEVERITIES, SYMPTOMS } from '../../../domain/model.js';

const SLOTS = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'extra_snack'];
const STATUSES = ['planned', 'prepared', 'eaten', 'refused', 'skipped'];

export class ReactionInputDto {
  @ApiProperty({ enum: SYMPTOMS, isArray: true, description: 'Ít nhất một dấu hiệu' })
  @IsArray()
  @ArrayMaxSize(SYMPTOMS.length * 2)
  @IsIn(SYMPTOMS, { each: true })
  symptoms: (typeof SYMPTOMS)[number][];

  @ApiProperty({ enum: SEVERITIES })
  @IsIn(SEVERITIES)
  severity: (typeof SEVERITIES)[number];

  // Counted by character in the domain (≤ 500, emoji included); this only caps the payload.
  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class LogMealDto {
  @ApiProperty({ format: 'date-time', example: '2026-09-24T11:40:00+07:00' })
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, {
    message: 'loggedAt must carry a time and a timezone offset',
  })
  loggedAt: string;

  @ApiProperty({ enum: EAT_AMOUNTS })
  @IsIn(EAT_AMOUNTS)
  amount: (typeof EAT_AMOUNTS)[number];

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  liking: number;

  @ApiPropertyOptional({ type: ReactionInputDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReactionInputDto)
  reaction?: ReactionInputDto | null;
}

export class JournalQueryDto {
  @ApiPropertyOptional({ description: 'nextCursor của trang trước' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

class NamedIngredientDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

class LogDishDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() custom: boolean;
}

class ReactionDto {
  @ApiProperty({ enum: SYMPTOMS, isArray: true }) symptoms: string[];
  @ApiProperty({ enum: SEVERITIES }) severity: string;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
}

export class LogDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) mealId: string;
  @ApiProperty({ format: 'date-time' }) loggedAt: Date;
  @ApiProperty({ nullable: true, type: String, description: 'Người ghi nhận (FR-118)' })
  loggedBy: string | null;
  @ApiProperty({ enum: EAT_AMOUNTS }) amount: string;
  @ApiProperty() liking: number;
  @ApiProperty({ enum: ['eaten', 'refused'] }) outcome: string;
  @ApiProperty({ type: ReactionDto, nullable: true }) reaction: ReactionDto | null;
}

class LogFormMealDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ enum: SLOTS }) slot: string;
  @ApiProperty({ example: '11:00' }) time: string;
  @ApiProperty({ enum: STATUSES }) status: string;
  @ApiProperty({ type: LogDishDto }) dish: LogDishDto;
}

export class LogFormDto {
  @ApiProperty({ type: LogFormMealDto }) meal: LogFormMealDto;
  @ApiProperty({ type: [NamedIngredientDto], description: 'Nguyên liệu bé thử lần đầu' })
  firstTryIngredients: NamedIngredientDto[];
  @ApiProperty({
    type: [NamedIngredientDto],
    description: 'Sẽ tạm dừng nếu ghi nhận có dấu hiệu bất thường (BR-40)',
  })
  suspectIngredients: NamedIngredientDto[];
  @ApiProperty({ type: LogDto, nullable: true }) log: LogDto | null;
}

export class LoggedMealDto {
  @ApiProperty({ type: LogDto }) log: LogDto;
  @ApiProperty({
    type: [NamedIngredientDto],
    description: 'Nguyên liệu đang tạm dừng sau ghi nhận',
  })
  pausedIngredients: NamedIngredientDto[];
}

export class JournalEntryDto {
  @ApiProperty({ enum: ['meal', 'urgent'] }) kind: 'meal' | 'urgent';
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) at: Date;
  @ApiProperty({ format: 'date', nullable: true, type: String }) date: string | null;
  @ApiProperty({ enum: SLOTS, nullable: true, type: String }) slot: string | null;
  @ApiProperty({ type: LogDishDto, nullable: true }) dish: LogDishDto | null;
  @ApiProperty({ enum: EAT_AMOUNTS, nullable: true, type: String }) amount: string | null;
  @ApiProperty({ nullable: true, type: Number }) liking: number | null;
  @ApiProperty({ type: ReactionDto, nullable: true }) reaction: ReactionDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  contactedMedicalAt: Date | null;
  @ApiProperty({ type: [NamedIngredientDto] }) pausedIngredients: NamedIngredientDto[];
  @ApiProperty({ nullable: true, type: String, description: 'Người thực hiện (FR-118)' })
  actorName: string | null;
}

export class JournalPageDto {
  @ApiProperty({ type: [JournalEntryDto] }) entries: JournalEntryDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor: string | null;
}
