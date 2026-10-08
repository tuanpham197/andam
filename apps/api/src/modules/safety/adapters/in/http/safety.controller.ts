import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../../../shared/auth/authenticator.port.js';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator.js';
import { PausedIngredientsService } from '../../../application/use-cases/paused-ingredients.service.js';
import { UrgentService } from '../../../application/use-cases/urgent.service.js';
import { OpenUrgentDto, PausedIngredientDto, UpdateUrgentDto, UrgentEventDto } from './dto.js';

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ version: '4' }));

@ApiTags('safety')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(
    @Inject(UrgentService) private readonly urgent: UrgentService,
    @Inject(PausedIngredientsService) private readonly paused: PausedIngredientsService,
  ) {}

  @Post('children/:childId/urgent-events')
  @ApiOperation({
    operationId: 'openUrgentEvent',
    summary: 'Mở “Dấu hiệu nguy hiểm”: ghi nhận và tạm dừng nguyên liệu liên quan (UC-10)',
  })
  @ApiCreatedResponse({ type: UrgentEventDto })
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Body() dto: OpenUrgentDto,
  ): Promise<UrgentEventDto> {
    return this.urgent.open(user.userId, childId, dto.mealId ?? null);
  }

  @Patch('urgent-events/:eventId')
  @ApiOperation({ operationId: 'updateUrgentEvent', summary: 'Đã liên hệ nhân viên y tế (FR-067)' })
  @ApiOkResponse({ type: UrgentEventDto })
  contacted(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('eventId') eventId: string,
    @Body() _dto: UpdateUrgentDto,
  ): Promise<UrgentEventDto> {
    return this.urgent.markContactedMedical(user.userId, eventId);
  }

  @Get('children/:childId/paused-ingredients')
  @ApiOperation({
    operationId: 'listPausedIngredients',
    summary: 'Nguyên liệu đang tạm dừng (G08)',
  })
  @ApiOkResponse({ type: [PausedIngredientDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
  ): Promise<PausedIngredientDto[]> {
    return this.paused.list(user.userId, childId);
  }

  @Post('children/:childId/paused-ingredients/:ingredientId/resume')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'resumeIngredient',
    summary: 'Bác sĩ đã cho phép dùng lại nguyên liệu (UC-14)',
  })
  @ApiNoContentResponse()
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('ingredientId') ingredientId: string,
  ): Promise<void> {
    return this.paused.resume(user.userId, childId, ingredientId);
  }
}
