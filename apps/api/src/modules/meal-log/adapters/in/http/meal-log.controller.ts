import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../../../shared/auth/authenticator.port.js';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator.js';
import type { JournalEntry } from '../../../application/ports/out/journal.reader.js';
import { JournalService } from '../../../application/use-cases/journal.service.js';
import { LogMealService } from '../../../application/use-cases/log-meal.service.js';
import {
  JournalEntryDto,
  JournalPageDto,
  JournalQueryDto,
  LogFormDto,
  LoggedMealDto,
  LogMealDto,
} from './dto.js';

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ version: '4' }));

const toEntryDto = (entry: JournalEntry): JournalEntryDto =>
  entry.kind === 'meal'
    ? { ...entry, contactedMedicalAt: null }
    : {
        kind: 'urgent',
        id: entry.id,
        at: entry.at,
        date: entry.meal?.date ?? null,
        slot: entry.meal?.slot ?? null,
        dish: entry.meal?.dish ?? null,
        amount: null,
        liking: null,
        reaction: null,
        contactedMedicalAt: entry.contactedMedicalAt,
        pausedIngredients: entry.pausedIngredients,
        actorName: entry.actorName,
      };

@ApiTags('meal-log')
@ApiBearerAuth()
@Controller()
export class MealLogController {
  constructor(
    @Inject(LogMealService) private readonly logs: LogMealService,
    @Inject(JournalService) private readonly journal: JournalService,
  ) {}

  @Get('meals/:mealId/log')
  @ApiOperation({ operationId: 'getMealLog', summary: 'Dữ liệu màn ghi nhận bữa ăn (S07)' })
  @ApiOkResponse({ type: LogFormDto })
  form(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('mealId') mealId: string,
  ): Promise<LogFormDto> {
    return this.logs.form(user.userId, mealId);
  }

  @Post('meals/:mealId/log')
  @ApiOperation({ operationId: 'logMeal', summary: 'Ghi nhận bữa ăn và phản ứng (UC-08/09)' })
  @ApiCreatedResponse({ type: LoggedMealDto })
  log(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('mealId') mealId: string,
    @Body() dto: LogMealDto,
  ): Promise<LoggedMealDto> {
    return this.logs.log(user.userId, mealId, { ...dto, loggedAt: new Date(dto.loggedAt) });
  }

  @Get('children/:childId/journal')
  @ApiOperation({ operationId: 'getJournal', summary: 'Nhật ký bữa ăn, phản ứng (FR-069)' })
  @ApiOkResponse({ type: JournalPageDto })
  async page(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Query() query: JournalQueryDto,
  ): Promise<JournalPageDto> {
    const page = await this.journal.page(user.userId, childId, query.cursor);
    return { entries: page.entries.map(toEntryDto), nextCursor: page.nextCursor };
  }
}
