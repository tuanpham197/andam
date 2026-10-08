import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  HEALTH_STATUSES,
  HEALTH_SYMPTOMS,
  type HealthStatus,
  type HealthSymptom,
} from '../../../domain/health-episode.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateHealthDto {
  @ApiProperty({ enum: HEALTH_STATUSES })
  @IsIn(HEALTH_STATUSES)
  status: HealthStatus;

  @ApiProperty({
    enum: HEALTH_SYMPTOMS,
    isArray: true,
    description: 'Bị bỏ qua khi trạng thái là Bình thường',
  })
  @IsArray()
  @ArrayMaxSize(HEALTH_SYMPTOMS.length)
  @IsIn(HEALTH_SYMPTOMS, { each: true })
  symptoms: HealthSymptom[];

  @ApiPropertyOptional({ format: 'date', description: 'Mặc định hôm nay' })
  @IsOptional()
  @IsString()
  @Matches(DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(DATE, { message: 'expectedEndDate must be YYYY-MM-DD' })
  expectedEndDate?: string | null;
}

export class HealthDto {
  @ApiProperty({ enum: HEALTH_STATUSES }) status: string;
  @ApiProperty({ enum: HEALTH_SYMPTOMS, isArray: true }) symptoms: string[];
  @ApiProperty({ format: 'date', nullable: true, type: String }) startDate: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) expectedEndDate: string | null;
  @ApiProperty({ description: 'Đã qua ngày dự kiến kết thúc mà chưa cập nhật' }) overdue: boolean;
}
