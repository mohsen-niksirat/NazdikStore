import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TokenService } from '../token.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../token.service';
import { ERROR_CODES } from '@nazdik/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly tokenService: TokenService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev_access_change_me',
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    if (!payload?.sub || !payload.role) {
      throw new UnauthorizedException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: 'Malformed token payload',
      });
    }
    return {
      id: payload.sub,
      phone: payload.phone,
      role: payload.role,
    };
  }
}
