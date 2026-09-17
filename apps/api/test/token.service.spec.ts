import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../src/auth/token.service';
import { RedisService } from '../src/redis/redis.service';

describe('TokenService', () => {
  let tokens: TokenService;
  let redis: RedisService;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET = 'test_access_secret';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.REDIS_URL = '';

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test_access_secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [TokenService, RedisService],
    }).compile();

    tokens = moduleRef.get(TokenService);
    redis = moduleRef.get(RedisService);
    redis.clearMemory();
  });

  const user = { id: 'user_1', phone: '09123456789', role: 'CONSUMER' as const };

  it('issues access + refresh tokens', async () => {
    const issued = await tokens.issueTokens(user);
    expect(issued.accessToken).toBeTruthy();
    expect(issued.refreshToken).toBeTruthy();
    expect(issued.expiresIn).toBe(900);
  });

  it('access token payload contains sub/phone/role', async () => {
    const issued = await tokens.issueTokens(user);
    const payload = tokens.verifyAccess(issued.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.phone).toBe(user.phone);
    expect(payload.role).toBe('CONSUMER');
  });

  it('rejects garbage access tokens', () => {
    expect(() => tokens.verifyAccess('not.a.jwt')).toThrow(UnauthorizedException);
  });

  it('rotates refresh tokens (old token dies after use)', async () => {
    const first = await tokens.issueTokens(user);
    const { userId } = await tokens.rotateRefreshToken(first.refreshToken);
    expect(userId).toBe(user.id);

    await expect(tokens.rotateRefreshToken(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects empty refresh tokens', async () => {
    await expect(tokens.rotateRefreshToken('')).rejects.toThrow(UnauthorizedException);
  });

  it('revokes all sessions for a user', async () => {
    const issued = await tokens.issueTokens(user);
    await tokens.revokeUserSessions(user.id);
    await expect(tokens.rotateRefreshToken(issued.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
