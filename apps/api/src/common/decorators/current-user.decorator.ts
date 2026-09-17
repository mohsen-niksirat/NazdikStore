import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@nazdik/shared';

export interface AuthUser {
  id: string;
  phone: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
