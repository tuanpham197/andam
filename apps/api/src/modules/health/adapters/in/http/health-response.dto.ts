import { ApiProperty } from '@nestjs/swagger';

class HealthChecksDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database: 'up' | 'down';
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  status: 'ok' | 'error';

  @ApiProperty({ type: HealthChecksDto })
  checks: HealthChecksDto;
}
