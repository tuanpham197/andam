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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../../../shared/auth/authenticator.port.js';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator.js';
import { ChildProfileService } from '../../../application/use-cases/child-profile.service.js';
import {
  AvoidListDto,
  ChildDto,
  ChildProfileDto,
  CreateChildDto,
  StagePreviewQueryDto,
  UpdateChildDto,
} from './dto.js';

const ChildId = () => Param('childId', new ParseUUIDPipe({ version: '4' }));

@ApiTags('children')
@ApiBearerAuth()
@Controller('children')
export class ChildrenController {
  constructor(@Inject(ChildProfileService) private readonly children: ChildProfileService) {}

  @Get()
  @ApiOperation({ operationId: 'listChildren', summary: 'Hồ sơ các bé của tài khoản' })
  @ApiOkResponse({ type: [ChildDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ChildDto[]> {
    return this.children.list(user.userId);
  }

  @Post()
  @ApiOperation({ operationId: 'createChild', summary: 'Tạo hồ sơ bé (UC-01)' })
  @ApiCreatedResponse({ type: ChildDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChildDto): Promise<ChildDto> {
    return this.children.create(user.userId, {
      ...dto,
      weeksEarly: dto.weeksEarly ?? 0,
      priorReactionNote: dto.priorReactionNote ?? null,
    });
  }

  @Get(':childId')
  @ApiOperation({ operationId: 'getChild', summary: 'Hồ sơ bé kèm tuổi và giai đoạn' })
  @ApiOkResponse({ type: ChildDto })
  get(@CurrentUser() user: AuthenticatedUser, @ChildId() childId: string): Promise<ChildDto> {
    return this.children.get(user.userId, childId);
  }

  @Patch(':childId')
  @ApiOperation({ operationId: 'updateChild', summary: 'Sửa hồ sơ, ngày sinh, giai đoạn (UC-03)' })
  @ApiOkResponse({ type: ChildDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @ChildId() childId: string,
    @Body() dto: UpdateChildDto,
  ): Promise<ChildDto> {
    return this.children.update(user.userId, childId, dto);
  }

  @Put(':childId/avoid-list')
  @ApiOperation({ operationId: 'replaceAvoidList', summary: 'Thực phẩm cần tránh (UC-02)' })
  @ApiOkResponse({ type: ChildDto })
  replaceAvoidList(
    @CurrentUser() user: AuthenticatedUser,
    @ChildId() childId: string,
    @Body() dto: AvoidListDto,
  ): Promise<ChildDto> {
    return this.children.replaceAvoidList(user.userId, childId, dto);
  }

  @Get(':childId/stage-preview')
  @ApiOperation({
    operationId: 'previewStage',
    summary: 'Xem trước tuổi/giai đoạn trước khi lưu (S10)',
  })
  @ApiOkResponse({ type: ChildProfileDto })
  previewStage(
    @CurrentUser() user: AuthenticatedUser,
    @ChildId() childId: string,
    @Query() query: StagePreviewQueryDto,
  ): Promise<ChildProfileDto> {
    return this.children.previewStage(user.userId, childId, query);
  }

  @Delete(':childId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteChild', summary: 'Xóa toàn bộ dữ liệu của bé' })
  async remove(@CurrentUser() user: AuthenticatedUser, @ChildId() childId: string): Promise<void> {
    await this.children.remove(user.userId, childId);
  }
}
