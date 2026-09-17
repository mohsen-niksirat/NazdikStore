import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OtpService } from '../src/auth/otp.service';
import { TokenService } from '../src/auth/token.service';

describe('AuthService profile completion', () => {
  let auth: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    vendorProfile: { findUnique: jest.Mock };
    authAuditLog: { create: jest.Mock };
  };
  let otp: { requestOtp: jest.Mock; verifyOtp: jest.Mock };
  let token: { issueTokens: jest.Mock; rotateRefreshToken: jest.Mock; revokeUserSessions: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      vendorProfile: { findUnique: jest.fn() },
      authAuditLog: { create: jest.fn() },
    };
    otp = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
    token = {
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'at',
        expiresIn: 900,
        refreshToken: 'rt',
      }),
      rotateRefreshToken: jest.fn(),
      revokeUserSessions: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: OtpService, useValue: otp },
        { provide: TokenService, useValue: token },
      ],
    }).compile();

    auth = moduleRef.get(AuthService);
  });

  const baseUser = {
    id: 'u1',
    phone: '09123456789',
    role: 'CONSUMER',
    firstName: null,
    lastName: null,
    avatarUrl: null,
    isPhoneVerified: true,
    createdAt: new Date(),
  };

  it('validates Iranian national ID check digit', () => {
    // Known valid pattern check
    expect(auth.isValidIranianNationalId('0084575948')).toBe(true);
    expect(auth.isValidIranianNationalId('1234567890')).toBe(false);
    expect(auth.isValidIranianNationalId('123')).toBe(false);
  });

  it('completes consumer profile without vendor fields', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      role: 'CONSUMER',
      firstName: 'Sara',
      vendorProfile: null,
    });

    const result = await auth.completeProfile('u1', {
      role: 'CONSUMER',
      firstName: 'Sara',
      lastName: 'Ahmadi',
    });

    expect(result.user.firstName).toBe('Sara');
    expect(result.vendorProfile).toBeNull();
  });

  it('requires businessName + vendorType for VENDOR role', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await expect(
      auth.completeProfile('u1', { role: 'VENDOR' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects self-assigned ADMIN (stays CONSUMER/VENDOR only)', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({ ...baseUser, role: 'CONSUMER', vendorProfile: null });

    const result = await auth.completeProfile('u1', { role: 'ADMIN' as never });
    expect(result.user.role).toBe('CONSUMER');
  });

  it('creates vendor profile when role=VENDOR with valid data', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.vendorProfile.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      role: 'VENDOR',
      vendorProfile: {
        id: 'vp1',
        businessName: 'آشپزخانه نزدیک',
        vendorType: 'FOOD',
        categoryTags: ['home-chef'],
        nationalId: '0084575948',
        verificationStatus: 'PENDING',
        description: 'غذای خانگی',
        socialLinks: {},
        isHomeBased: true,
      },
    });

    const result = await auth.completeProfile('u1', {
      role: 'VENDOR',
      businessName: 'آشپزخانه نزدیک',
      vendorType: 'FOOD',
      nationalId: '0084575948',
      description: 'غذای خانگی',
      isHomeBased: true,
      categoryTags: ['home-chef'],
    });

    expect(result.user.role).toBe('VENDOR');
    expect(result.vendorProfile?.businessName).toBe('آشپزخانه نزدیک');
    expect(result.vendorProfile?.vendorType).toBe('FOOD');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('rejects invalid national ID for vendors', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await expect(
      auth.completeProfile('u1', {
        role: 'VENDOR',
        businessName: 'X',
        vendorType: 'FOOD',
        nationalId: '1234567890',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('conflicts when national ID already used by another vendor', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.vendorProfile.findUnique.mockResolvedValue({
      id: 'other',
      userId: 'someone-else',
      nationalId: '0084575948',
    });

    await expect(
      auth.completeProfile('u1', {
        role: 'VENDOR',
        businessName: 'X',
        vendorType: 'BEAUTY',
        nationalId: '0084575948',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('verifyOtp upserts user and issues tokens', async () => {
    otp.verifyOtp.mockResolvedValue({ phone: '09123456789' });
    prisma.user.upsert.mockResolvedValue({
      ...baseUser,
      vendorProfile: null,
    });
    prisma.authAuditLog.create.mockResolvedValue({});

    const result = await auth.verifyOtp('09123456789', '12345', '1.2.3.4', 'jest');
    expect(result.user.phone).toBe('09123456789');
    expect(result.tokens.accessToken).toBe('at');
    expect(result.requiresProfileCompletion).toBe(false);
    expect(prisma.user.upsert).toHaveBeenCalled();
  });
});
