import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Only shape checks here; the business rules (format, length, deny-list) live in the domain.

export class RegisterDto {
  @ApiProperty({ example: 'me.na@example.vn', maxLength: 254 })
  @IsString()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MaxLength(1000)
  password: string;

  @ApiPropertyOptional({ description: 'Phiên bản chính sách xử lý dữ liệu người dùng đồng ý' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  consentVersion?: string;
}

export class LoginDto {
  @ApiProperty({ maxLength: 254 })
  @IsString()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ maxLength: 254 })
  @IsString()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MaxLength(1000)
  newPassword: string;
}

export class DeleteAccountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  password: string;
}

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'JWT, gửi trong header Authorization: Bearer' })
  accessToken: string;

  @ApiProperty({ format: 'date-time' })
  accessTokenExpiresAt: Date;
}

export class AccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
