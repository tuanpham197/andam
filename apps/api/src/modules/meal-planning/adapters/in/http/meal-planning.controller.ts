import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
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
import { CustomDishService } from '../../../application/use-cases/custom-dish.service.js';
import { DayPlanService } from '../../../application/use-cases/day-plan.service.js';
import { LibraryService } from '../../../application/use-cases/library.service.js';
import { RecipeService } from '../../../application/use-cases/recipe.service.js';
import { SwapService } from '../../../application/use-cases/swap.service.js';
import { WeekPlanService } from '../../../application/use-cases/week-plan.service.js';
import {
  CustomDishFormDto,
  CustomDishInputDto,
  DayPlanDto,
  GenerateWeekDto,
  HealthPreviewDto,
  HealthPreviewQueryDto,
  LibraryDto,
  LibraryQueryDto,
  MealDto,
  MealStatusDto,
  RecipeDto,
  RecipeQueryDto,
  SwapDto,
  SwapQueryDto,
  SwapSuggestionsDto,
  UpdateMealDto,
  WeekPlanDto,
} from './dto.js';

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ version: '4' }));

@ApiTags('meal-planning')
@ApiBearerAuth()
@Controller()
export class MealPlanningController {
  constructor(
    @Inject(DayPlanService) private readonly dayPlans: DayPlanService,
    @Inject(RecipeService) private readonly recipes: RecipeService,
    @Inject(SwapService) private readonly swaps: SwapService,
    @Inject(LibraryService) private readonly library: LibraryService,
    @Inject(CustomDishService) private readonly customDishes: CustomDishService,
    @Inject(WeekPlanService) private readonly weeks: WeekPlanService,
  ) {}

  @Get('children/:childId/days/:date')
  @ApiOperation({
    operationId: 'getDayPlan',
    summary: 'Thực đơn một ngày, tự lập nếu chưa có (UC-04)',
  })
  @ApiOkResponse({ type: DayPlanDto })
  day(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('date') date: string,
  ): Promise<DayPlanDto> {
    return this.dayPlans.getDay(user.userId, childId, date);
  }

  @Patch('meals/:mealId')
  @ApiOperation({ operationId: 'updateMeal', summary: 'Đánh dấu đã chuẩn bị (FR-025)' })
  @ApiOkResponse({ type: MealStatusDto })
  updateMeal(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('mealId') mealId: string,
    @Body() _dto: UpdateMealDto,
  ): Promise<MealStatusDto> {
    return this.dayPlans.markPrepared(user.userId, mealId);
  }

  @Get('meals/:mealId/swap-suggestions')
  @ApiOperation({ operationId: 'getSwapSuggestions', summary: 'Gợi ý đổi món cho một bữa (UC-06)' })
  @ApiOkResponse({ type: SwapSuggestionsDto })
  swapSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('mealId') mealId: string,
    @Query() query: SwapQueryDto,
  ): Promise<SwapSuggestionsDto> {
    return this.swaps.suggestions(user.userId, mealId, query.reason ?? 'missing_ingredient');
  }

  @Post('meals/:mealId/swap')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'swapMeal',
    summary: 'Đổi món cho bữa, kiểm tra lại bộ lọc an toàn (FR-045)',
  })
  @ApiOkResponse({ type: MealDto })
  swap(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('mealId') mealId: string,
    @Body() dto: SwapDto,
  ): Promise<MealDto> {
    return this.swaps.apply(user.userId, mealId, dto);
  }

  @Get('children/:childId/dishes')
  @ApiOperation({ operationId: 'listDishes', summary: 'Thư viện món đã lọc cho bé (UC-07)' })
  @ApiOkResponse({ type: LibraryDto })
  dishes(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Query() query: LibraryQueryDto,
  ): Promise<LibraryDto> {
    return this.library.search(user.userId, childId, query);
  }

  @Get('children/:childId/dishes/:dishId')
  @ApiOperation({ operationId: 'getRecipe', summary: 'Công thức món theo bé và giai đoạn (UC-05)' })
  @ApiOkResponse({ type: RecipeDto })
  recipe(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('dishId') dishId: string,
    @Query() query: RecipeQueryDto,
  ): Promise<RecipeDto> {
    return this.recipes.get(user.userId, childId, dishId, query.stage);
  }

  @Post('children/:childId/custom-dishes')
  @ApiOperation({ operationId: 'createCustomDish', summary: 'Tạo món của bạn (UC-23)' })
  @ApiCreatedResponse({ type: RecipeDto })
  createCustomDish(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Body() dto: CustomDishInputDto,
  ): Promise<RecipeDto> {
    return this.customDishes.create(user.userId, childId, dto);
  }

  @Get('children/:childId/custom-dishes/:dishId')
  @ApiOperation({ operationId: 'getCustomDish', summary: 'Món của bạn, để sửa (FR-135)' })
  @ApiOkResponse({ type: CustomDishFormDto })
  customDish(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('dishId') dishId: string,
  ): Promise<CustomDishFormDto> {
    return this.customDishes.form(user.userId, childId, dishId);
  }

  @Put('children/:childId/custom-dishes/:dishId')
  @ApiOperation({ operationId: 'updateCustomDish', summary: 'Sửa món của bạn (FR-135)' })
  @ApiOkResponse({ type: RecipeDto })
  updateCustomDish(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('dishId') dishId: string,
    @Body() dto: CustomDishInputDto,
  ): Promise<RecipeDto> {
    return this.customDishes.update(user.userId, childId, dishId, dto);
  }

  @Delete('children/:childId/custom-dishes/:dishId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteCustomDish', summary: 'Xóa món của bạn (FR-136)' })
  @ApiNoContentResponse()
  deleteCustomDish(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('dishId') dishId: string,
  ): Promise<void> {
    return this.customDishes.archive(user.userId, childId, dishId);
  }

  @Get('children/:childId/weeks/:weekStart')
  @ApiOperation({
    operationId: 'getWeekPlan',
    summary: 'Thực đơn tuần (Thứ Hai → Chủ nhật) và chỉ số (UC-12)',
  })
  @ApiOkResponse({ type: WeekPlanDto })
  week(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('weekStart') weekStart: string,
  ): Promise<WeekPlanDto> {
    return this.weeks.getWeek(user.userId, childId, weekStart);
  }

  @Post('children/:childId/weeks/:weekStart/generate')
  @HttpCode(200)
  @ApiOperation({ operationId: 'generateWeekPlan', summary: 'Lên thực đơn tuần (UC-13)' })
  @ApiOkResponse({ type: WeekPlanDto })
  generateWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Param('weekStart') weekStart: string,
    @Body() dto: GenerateWeekDto,
  ): Promise<WeekPlanDto> {
    return this.weeks.generate(user.userId, childId, weekStart, dto.overwrite ?? false);
  }

  @Get('children/:childId/health/preview')
  @ApiOperation({
    operationId: 'previewHealthMenu',
    summary: 'Thực đơn sẽ thay đổi thế nào theo trạng thái sức khỏe (FR-083)',
  })
  @ApiOkResponse({ type: HealthPreviewDto })
  healthPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Query() query: HealthPreviewQueryDto,
  ): Promise<HealthPreviewDto> {
    return this.dayPlans.healthPreview(user.userId, childId, query.status);
  }
}
