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
import {
  CustomDishFormDto,
  CustomDishInputDto,
  DayPlanDto,
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
}
