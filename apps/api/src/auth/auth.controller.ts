import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CompleteProfileDto, RefreshTokenDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/roles.decorator';

const REFRESH_COOKIE = 'nazdik_rt';

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request SMS OTP (rate-limited)' })
  async requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    const data = await this.auth.requestOtp(dto.phone, ip ?? '0.0.0.0');
    return { success: true, data };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and issue tokens' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyOtp(
      dto.phone,
      dto.code,
      ip ?? '0.0.0.0',
      req.headers['user-agent'],
    );

    this.setRefreshCookie(res, result.refreshToken);

    return {
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        vendorProfile: result.vendorProfile,
        requiresProfileCompletion: result.requiresProfileCompletion,
      },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    const result = await this.auth.refresh(dto.refreshToken || cookieToken);
    this.setRefreshCookie(res, result.refreshToken);
    return {
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh session' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id);
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/api/v1/auth' });
    return { success: true, data: { loggedOut: true } };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('profile/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete consumer or vendor profile after first login' })
  async completeProfile(@CurrentUser() user: AuthUser, @Body() dto: CompleteProfileDto) {
    const data = await this.auth.completeProfile(user.id, dto);
    return { success: true, data };
  }

  private setRefreshCookie(res: Response, token: string) {
    const days = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: days * 24 * 3600 * 1000,
      path: '/api/v1/auth',
    });
  }
}
