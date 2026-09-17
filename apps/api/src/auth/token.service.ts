import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import { ERROR_CODES, type Role } from '@nazdik/shared';

export interface AccessTokenPayload {
  sub: string;
  phone: string;
  role: Role;
}

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  private get refreshTtlDays(): number {
    return Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
  }

  private get accessTtl(): string {
    return process.env.JWT_ACCESS_TTL ?? '15m';
  }

  private accessTtlSeconds(): number {
    const raw = this.accessTtl;
    if (raw.endsWith('m')) return parseInt(raw) * 60;
    if (raw.endsWith('s')) return parseInt(raw);
    if (raw.endsWith('h')) return parseInt(raw) * 3600;
    return 900;
  }

  async issueTokens(user: { id: string; phone: string; role: Role }): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = this.generateRefreshToken();
    const ttl = this.refreshTtlDays * 24 * 3600;

    await this.redis.set(this.refreshKey(refreshToken), user.id, ttl);
    await this.redis.set(`rt:user:${user.id}`, refreshToken, ttl);

    return {
      accessToken,
      expiresIn: this.accessTtlSeconds(),
      refreshToken,
    };
  }

  async rotateRefreshToken(presented: string): Promise<{ userId: string }> {
    if (!presented) {
      throw new UnauthorizedException({
        code: ERROR_CODES.REFRESH_TOKEN_INVALID,
        message: 'Refresh token required',
      });
    }

    const userId = await this.redis.get(this.refreshKey(presented));
    if (!userId) {
      throw new UnauthorizedException({
        code: ERROR_CODES.REFRESH_TOKEN_INVALID,
        message: 'Refresh token invalid or expired',
      });
    }

    // Rotation: invalidate old token, issue new one at service layer
    await this.redis.del(this.refreshKey(presented));
    const current = await this.redis.get(`rt:user:${userId}`);
    if (current === presented) {
      await this.redis.del(`rt:user:${userId}`);
    }

    return { userId };
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const current = await this.redis.get(`rt:user:${userId}`);
    if (current) {
      await this.redis.del(this.refreshKey(current));
      await this.redis.del(`rt:user:${userId}`);
    }
  }

  verifyAccess(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: 'Invalid or expired access token',
      });
    }
  }

  private refreshKey(token: string): string {
    return `rt:${token}`;
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }
}
