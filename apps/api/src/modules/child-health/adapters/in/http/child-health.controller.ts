import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../../../shared/auth/authenticator.port.js';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator.js';
import { ChildHealthService } from '../../../application/use-cases/child-health.service.js';
import { HealthDto, UpdateHealthDto } from './dto.js';

const ChildId = () => Param('childId', new ParseUUIDPipe({ version: '4' }));

@ApiTags('child-health')
@ApiBearerAuth()
@Controller('children/:childId/health')
export class ChildHealthController {
  constructor(@Inject(ChildHealthService) private readonly health: ChildHealthService) {}

  @Get()
  @ApiOperation({ operationId: 'getChildHealth', summary: 'Tình trạng sức khỏe hiện tại (UC-11)' })
  @ApiOkResponse({ type: HealthDto })
  get(@CurrentUser() user: AuthenticatedUser, @ChildId() childId: string): Promise<HealthDto> {
    return this.health.current(user.userId, childId);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'updateChildHealth',
    summary: 'Cập nhật sức khỏe và sinh lại các bữa sắp tới (FR-080..084)',
  })
  @ApiOkResponse({ type: HealthDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @ChildId() childId: string,
    @Body() dto: UpdateHealthDto,
  ): Promise<HealthDto> {
    return this.health.update(user.userId, childId, dto);
  }
}
