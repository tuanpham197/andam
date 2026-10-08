import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { ALLERGENS } from '../../../domain/child.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIOR_REACTIONS = ['never', 'yes', 'unsure'];
const REASONS = ['not_eat', 'dislike'];

// Shape only; business limits (30 chars, 1–16 weeks, 100 items…) are enforced by the domain.

export class AvoidIngredientDto {
  @ApiProperty({ example: 'ing_muop_dang' })
  @IsString()
  @MaxLength(64)
  ingredientId: string;

  @ApiProperty({ enum: REASONS })
  @IsIn(REASONS)
  reason: 'not_eat' | 'dislike';
}

export class CreateChildDto {
  @ApiProperty({ maxLength: 30, example: 'Na' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ format: 'date', example: '2026-01-12' })
  @IsString()
  @Matches(DATE, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate: string;

  @ApiProperty()
  @IsBoolean()
  isPremature: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 16, description: 'Chỉ khi isPremature = true' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(52)
  weeksEarly?: number;

  @ApiProperty({ enum: PRIOR_REACTIONS })
  @IsIn(PRIOR_REACTIONS)
  priorReaction: 'never' | 'yes' | 'unsure';

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  priorReactionNote?: string | null;

  @ApiProperty({ enum: ALLERGENS, isArray: true })
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(ALLERGENS, { each: true })
  avoidAllergens: (typeof ALLERGENS)[number][];

  @ApiProperty({ type: [AvoidIngredientDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AvoidIngredientDto)
  avoidIngredients: AvoidIngredientDto[];
}

export class UpdateChildDto {
  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(DATE, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPremature?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 16 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(52)
  weeksEarly?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 4,
    nullable: true,
    type: Number,
    description: 'Giữ giai đoạn thấp hơn tuổi; null = về theo tuổi',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(4)
  stageOverride?: number | null;

  @ApiPropertyOptional({ enum: PRIOR_REACTIONS })
  @IsOptional()
  @IsIn(PRIOR_REACTIONS)
  priorReaction?: 'never' | 'yes' | 'unsure';

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  priorReactionNote?: string | null;
}

export class AvoidListDto {
  @ApiProperty({ enum: ALLERGENS, isArray: true })
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(ALLERGENS, { each: true })
  allergens: (typeof ALLERGENS)[number][];

  @ApiProperty({ type: [AvoidIngredientDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AvoidIngredientDto)
  ingredients: AvoidIngredientDto[];
}

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class StagePreviewQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(DATE)
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPremature?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(52)
  weeksEarly?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  stage?: number;
}

export class AgeDto {
  @ApiProperty() months: number;
  @ApiProperty() days: number;
  @ApiProperty({ description: 'Tuổi hiệu chỉnh (sinh non)' }) corrected: boolean;
}

export class StageStateDto {
  @ApiProperty({ minimum: 1, maximum: 4 }) id: number;
  @ApiProperty({ enum: ['selected', 'open', 'locked'] }) state: 'selected' | 'open' | 'locked';
  @ApiProperty() unlockAtMonths: number;
}

export class ChildProfileDto {
  @ApiProperty({ type: AgeDto }) age: AgeDto;
  @ApiProperty({ nullable: true, type: Number }) autoStage: number | null;
  @ApiProperty({ nullable: true, type: Number }) effectiveStage: number | null;
  @ApiProperty() isOverride: boolean;
  @ApiProperty() plannable: boolean;
  @ApiProperty({ enum: ['too_young', 'too_old'], nullable: true, type: String })
  notPlannableReason: 'too_young' | 'too_old' | null;
  @ApiProperty({ type: [StageStateDto] }) stages: StageStateDto[];
}

export class AvoidIngredientViewDto extends AvoidIngredientDto {
  @ApiProperty({ nullable: true, type: String }) name: string | null;
}

export class ChildDto extends ChildProfileDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'Na' }) initials: string;
  @ApiProperty({ format: 'date' }) birthDate: string;
  @ApiProperty() isPremature: boolean;
  @ApiProperty() weeksEarly: number;
  @ApiProperty({ enum: PRIOR_REACTIONS }) priorReaction: 'never' | 'yes' | 'unsure';
  @ApiProperty({ nullable: true, type: String }) priorReactionNote: string | null;
  @ApiProperty({ enum: ALLERGENS, isArray: true }) avoidAllergens: (typeof ALLERGENS)[number][];
  @ApiProperty({ type: [AvoidIngredientViewDto] }) avoidIngredients: AvoidIngredientViewDto[];
  @ApiProperty({ nullable: true, type: Number }) stageOverride: number | null;
  @ApiProperty({ enum: ['owner', 'caregiver'], description: 'Vai trò của bạn với bé (BR-73)' })
  role: 'owner' | 'caregiver';
}

class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() displayName: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ['owner', 'caregiver'] }) role: string;
  @ApiProperty({ format: 'date-time' }) joinedAt: Date;
  @ApiProperty() isMe: boolean;
}

class PendingInviteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
}

export class MembersDto {
  @ApiProperty({ type: [MemberDto] }) members: MemberDto[];
  @ApiProperty({ type: [PendingInviteDto], description: 'Chỉ chủ hồ sơ nhận được' })
  pendingInvites: PendingInviteDto[];
}

export class CreatedInviteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'Link mời — chỉ trả một lần, server không lưu token' }) url: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
}

export class InvitePreviewDto {
  @ApiProperty() childName: string;
  @ApiProperty() inviterName: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
}

export class AcceptedInviteDto {
  @ApiProperty({ format: 'uuid' }) childId: string;
  @ApiProperty({ enum: ['caregiver'] }) role: string;
}

export class TransferOwnershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId: string;
}
