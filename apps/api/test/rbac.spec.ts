import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';

function ctxWithUser(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (RBAC)', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows public routes', () => {
    reflector.getAllAndOverride.mockImplementation((_key: string, _targets: unknown[]) => {
      // first call isPublic
      return true;
    });
    expect(guard.canActivate(ctxWithUser())).toBe(true);
  });

  it('allows when no roles metadata is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' }))).toBe(true);
  });

  it('allows CONSUMER when CONSUMER required', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce(['CONSUMER']); // roles
    expect(
      guard.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' })),
    ).toBe(true);
  });

  it('forbids CONSUMER on VENDOR-only route', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['VENDOR']);
    expect(() =>
      guard.canActivate(ctxWithUser({ id: '1', phone: '09', role: 'CONSUMER' })),
    ).toThrow(ForbiddenException);
  });

  it('allows VENDOR on VENDOR-only route', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['VENDOR']);
    expect(guard.canActivate(ctxWithUser({ id: '2', phone: '09', role: 'VENDOR' }))).toBe(true);
  });

  it('ADMIN bypasses role restrictions', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['VENDOR']);
    expect(guard.canActivate(ctxWithUser({ id: '3', phone: '09', role: 'ADMIN' }))).toBe(true);
  });

  it('throws when required roles set but no user on request', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['CONSUMER']);
    expect(() => guard.canActivate(ctxWithUser(undefined))).toThrow(ForbiddenException);
  });
});
