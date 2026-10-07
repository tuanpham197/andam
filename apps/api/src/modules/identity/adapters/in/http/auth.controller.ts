import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../../../shared/auth/public.decorator.js';
import { AuthRateLimited } from '../../../../../shared/infrastructure/http/rate-limit.js';
import { LoginService } from '../../../application/use-cases/login.service.js';
import { LogoutService } from '../../../application/use-cases/logout.service.js';
import { RefreshSessionService } from '../../../application/use-cases/refresh-session.service.js';
import { RegisterService } from '../../../application/use-cases/register.service.js';
import { RequestPasswordResetService } from '../../../application/use-cases/request-password-reset.service.js';
import { ResetPasswordService } from '../../../application/use-cases/reset-password.service.js';
import type { Session } from '../../../application/use-cases/session.js';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SessionResponseDto,
} from './dto.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

const userAgentOf = (req: Request) => req.headers['user-agent'] ?? null;

function respond(res: Response, session: Session): SessionResponseDto {
  setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
  return {
    userId: session.userId,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
  };
}

@ApiTags('auth')
@Public()
@AuthRateLimited()
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RegisterService) private readonly registerUser: RegisterService,
    @Inject(LoginService) private readonly loginUser: LoginService,
    @Inject(RefreshSessionService) private readonly refreshSession: RefreshSessionService,
    @Inject(LogoutService) private readonly logoutUser: LogoutService,
    @Inject(RequestPasswordResetService) private readonly requestReset: RequestPasswordResetService,
    @Inject(ResetPasswordService) private readonly resetPassword: ResetPasswordService,
  ) {}

  @Post('register')
  @ApiOperation({ operationId: 'register', summary: 'Đăng ký tài khoản (UC-18)' })
  @ApiCreatedResponse({ type: SessionResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const session = await this.registerUser.execute({
      ...dto,
      userAgent: userAgentOf(req),
      ip: req.ip ?? null,
    });
    return respond(res, session);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ operationId: 'login', summary: 'Đăng nhập' })
  @ApiOkResponse({ type: SessionResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    return respond(res, await this.loginUser.execute({ ...dto, userAgent: userAgentOf(req) }));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ operationId: 'refreshSession', summary: 'Xoay vòng refresh token (cookie)' })
  @ApiOkResponse({ type: SessionResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const session = await this.refreshSession.execute({
      refreshToken: req.cookies?.[REFRESH_COOKIE],
      userAgent: userAgentOf(req),
    });
    return respond(res, session);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ operationId: 'logout', summary: 'Đăng xuất thiết bị hiện tại' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logoutUser.execute({ refreshToken: req.cookies?.[REFRESH_COOKIE] });
    clearRefreshCookie(res);
  }

  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({ operationId: 'forgotPassword', summary: 'Gửi e-mail đặt lại mật khẩu' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.requestReset.execute(dto);
  }

  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({ operationId: 'resetPassword', summary: 'Đặt mật khẩu mới bằng liên kết e-mail' })
  async resetPasswordWithToken(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resetPassword.execute(dto);
  }
}
