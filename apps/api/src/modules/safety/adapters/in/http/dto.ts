import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsOptional, IsUUID } from 'class-validator';

export class OpenUrgentDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Bữa vừa ăn: nguyên liệu mới và có tag dị ứng của bữa này sẽ tạm dừng (BR-41)',
  })
  @IsOptional()
  @IsUUID('4')
  mealId?: string | null;
}

export class UpdateUrgentDto {
  @ApiProperty({ enum: [true], description: '“Tôi đã liên hệ nhân viên y tế” (FR-067)' })
  @Equals(true)
  contactedMedical: true;
}

class NamedIngredientDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class UrgentEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) mealId: string | null;
  @ApiProperty({ format: 'date-time' }) openedAt: Date;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  contactedMedicalAt: Date | null;
  @ApiProperty({ type: [NamedIngredientDto] }) pausedIngredients: NamedIngredientDto[];
}

class PauseMealDto {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty() slot: string;
  @ApiProperty() dishName: string;
}

export class PausedIngredientDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() ingredientId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['reaction', 'urgent'] }) reason: string;
  @ApiProperty({ format: 'date-time' }) pausedAt: Date;
  @ApiProperty({ type: PauseMealDto, nullable: true }) meal: PauseMealDto | null;
}
