import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import {
  ListStagesService,
  SearchIngredientsService,
} from '../../../application/use-cases/catalog-queries.js';

export class SearchIngredientsQueryDto {
  @ApiProperty({ description: 'Tên hoặc tên gọi khác, không cần dấu', maxLength: 100 })
  @IsString()
  @MaxLength(200)
  q: string;
}

export class StageDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() ageFromMonths: number;
  @ApiProperty() ageToMonths: number;
  @ApiProperty({ enum: ['puree_smooth', 'mashed', 'lumpy', 'minced_soft', 'family'] })
  texture: string;
  @ApiProperty() portionText: string;
  @ApiProperty() mainMeals: number;
  @ApiProperty() snacksMin: number;
  @ApiProperty() snacksMax: number;
}

export class IngredientDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['carb', 'protein', 'fat', 'veg', 'fruit', 'seasoning'] })
  foodGroup: string;
  @ApiPropertyOptional({
    enum: ['fish', 'chicken', 'beef', 'pork', 'legume', 'egg'],
    nullable: true,
    type: String,
  })
  proteinSource: string | null;
  @ApiProperty({
    isArray: true,
    enum: ['egg', 'cow_milk', 'peanut', 'shellfish', 'fish', 'wheat', 'soy', 'sesame', 'tree_nut'],
  })
  allergenTags: string[];
}

@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(
    @Inject(ListStagesService) private readonly listStages: ListStagesService,
    @Inject(SearchIngredientsService) private readonly searchIngredients: SearchIngredientsService,
  ) {}

  @Get('stages')
  @ApiOperation({ operationId: 'listStages', summary: 'Các giai đoạn ăn dặm (BR-13)' })
  @ApiOkResponse({ type: [StageDto] })
  stages(): Promise<StageDto[]> {
    return this.listStages.execute();
  }

  @Get('ingredients')
  @ApiOperation({ operationId: 'searchIngredients', summary: 'Tìm nguyên liệu (không dấu)' })
  @ApiOkResponse({ type: [IngredientDto] })
  ingredients(@Query() query: SearchIngredientsQueryDto): Promise<IngredientDto[]> {
    return this.searchIngredients.execute(query);
  }
}
