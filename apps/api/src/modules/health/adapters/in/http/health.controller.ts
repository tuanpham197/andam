import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../../../shared/auth/public.decorator.js';
import { CheckHealthService } from '../../../application/use-cases/check-health.service.js';
import { HealthResponseDto } from './health-response.dto.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(CheckHealthService) private readonly checkHealth: CheckHealthService) {}

  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'Liveness + database connectivity' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Database is not reachable' })
  async check(): Promise<HealthResponseDto> {
    const report = await this.checkHealth.execute();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return report;
  }
}
