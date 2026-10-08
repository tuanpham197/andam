import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
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
import { Public } from '../../../../../shared/auth/public.decorator.js';
import { AuthRateLimited } from '../../../../../shared/infrastructure/http/rate-limit.js';
import { MembersService } from '../../../application/use-cases/members.service.js';
import {
  AcceptedInviteDto,
  CreatedInviteDto,
  InvitePreviewDto,
  MembersDto,
  TransferOwnershipDto,
} from './dto.js';

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ version: '4' }));

@ApiTags('members')
@ApiBearerAuth()
@Controller('children/:childId')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get('members')
  @ApiOperation({ operationId: 'listMembers', summary: 'Thành viên chăm bé (FR-113)' })
  @ApiOkResponse({ type: MembersDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
  ): Promise<MembersDto> {
    return this.members.list(user.userId, childId);
  }

  @Post('invites')
  @ApiOperation({ operationId: 'createInvite', summary: 'Tạo link mời người chăm (UC-20)' })
  @ApiCreatedResponse({ type: CreatedInviteDto })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
  ): Promise<CreatedInviteDto> {
    return this.members.createInvite(user.userId, childId);
  }

  @Delete('invites/:inviteId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'revokeInvite', summary: 'Thu hồi lời mời (FR-114)' })
  @ApiNoContentResponse()
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Uuid('inviteId') inviteId: string,
  ): Promise<void> {
    return this.members.revokeInvite(user.userId, childId, inviteId);
  }

  @Delete('members/:userId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'removeMember',
    summary: 'Gỡ người chăm; gỡ chính mình là rời hồ sơ (FR-114/115)',
  })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Uuid('userId') memberId: string,
  ): Promise<void> {
    return this.members.remove(user.userId, childId, memberId);
  }

  @Post('transfer-ownership')
  @HttpCode(204)
  @ApiOperation({ operationId: 'transferOwnership', summary: 'Chuyển quyền chủ hồ sơ (FR-116)' })
  @ApiNoContentResponse()
  transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Uuid('childId') childId: string,
    @Body() dto: TransferOwnershipDto,
  ): Promise<void> {
    return this.members.transferOwnership(user.userId, childId, dto.userId);
  }
}

/** Opening a link (UC-21). Throttled like the auth routes: tokens must not be guessed (TC-FAM-027). */
@ApiTags('members')
@AuthRateLimited()
@Controller('invites/:token')
export class InvitesController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get()
  @Public()
  @ApiOperation({ operationId: 'previewInvite', summary: 'Xem trước lời mời, không cần đăng nhập' })
  @ApiOkResponse({ type: InvitePreviewDto })
  preview(@Param('token') token: string): Promise<InvitePreviewDto> {
    return this.members.preview(token);
  }

  @Post('accept')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'acceptInvite', summary: 'Tham gia chăm bé (FR-112)' })
  @ApiOkResponse({ type: AcceptedInviteDto })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<AcceptedInviteDto> {
    return this.members.accept(user.userId, token);
  }
}
