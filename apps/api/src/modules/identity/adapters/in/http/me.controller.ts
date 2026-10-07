import { Body, Controller, Delete, Get, HttpCode, Inject, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../../../shared/auth/authenticator.port.js';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator.js';
import { DeleteAccountService } from '../../../application/use-cases/delete-account.service.js';
import { GetMeService } from '../../../application/use-cases/get-me.service.js';
import { AccountResponseDto, DeleteAccountDto } from './dto.js';
import { clearRefreshCookie } from './refresh-cookie.js';

@ApiTags('account')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    @Inject(GetMeService) private readonly getMe: GetMeService,
    @Inject(DeleteAccountService) private readonly deleteAccount: DeleteAccountService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'getMe', summary: 'Tài khoản đang đăng nhập' })
  @ApiOkResponse({ type: AccountResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AccountResponseDto> {
    return this.getMe.execute(user);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteAccount',
    summary: 'Xóa tài khoản và toàn bộ dữ liệu (UC-19)',
  })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.deleteAccount.execute({ userId: user.userId, password: dto.password });
    clearRefreshCookie(res);
  }
}
