import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { CompleteProfileDto } from './dto/auth.dto';
import {
  ERROR_CODES,
  isVendorType,
  normalizeIrMobile,
  type Role,
  type UserPublic,
  type VendorProfilePublic,
  type VendorType,
  type VerificationStatus,
} from '@nazdik/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}

  async requestOtp(phone: string, ip: string) {
    return this.otpService.requestOtp(phone, ip);
  }

  async verifyOtp(phone: string, code: string, ip: string, userAgent?: string) {
    const { phone: normalized } = await this.otpService.verifyOtp(phone, code);

    const user = await this.prisma.user.upsert({
      where: { phone: normalized },
      update: {
        isPhoneVerified: true,
        isActive: true,
      },
      create: {
        phone: normalized,
        isPhoneVerified: true,
        role: 'CONSUMER',
      },
      include: { vendorProfile: true },
    });

    await this.prisma.authAuditLog.create({
      data: {
        phone: normalized,
        action: 'OTP_VERIFIED',
        ip,
        userAgent,
        meta: { userId: user.id },
      },
    });

    const tokens = await this.tokenService.issueTokens({
      id: user.id,
      phone: user.phone,
      role: user.role as Role,
    });

    const requiresProfileCompletion =
      user.role === 'VENDOR' && !user.vendorProfile;

    return {
      user: this.toUserPublic(user),
      tokens: {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      },
      refreshToken: tokens.refreshToken,
      vendorProfile: user.vendorProfile
        ? this.toVendorPublic(user.vendorProfile)
        : null,
      requiresProfileCompletion,
    };
  }

  async refresh(refreshToken?: string) {
    const cookieToken = refreshToken;
    if (!cookieToken) {
      throw new BadRequestException({
        code: ERROR_CODES.REFRESH_TOKEN_INVALID,
        message: 'Refresh token missing',
      });
    }

    const { userId } = await this.tokenService.rotateRefreshToken(cookieToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vendorProfile: true },
    });
    if (!user || !user.isActive) {
      throw new BadRequestException({
        code: ERROR_CODES.REFRESH_TOKEN_INVALID,
        message: 'User inactive or missing',
      });
    }

    const tokens = await this.tokenService.issueTokens({
      id: user.id,
      phone: user.phone,
      role: user.role as Role,
    });

    return {
      user: this.toUserPublic(user),
      tokens: {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      },
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string) {
    await this.tokenService.revokeUserSessions(userId);
    return { success: true };
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'User not found',
      });
    }

    // Admin role cannot be self-assigned via profile completion
    const role: Role = dto.role === 'VENDOR' ? 'VENDOR' : 'CONSUMER';

    if (role === 'VENDOR') {
      if (!dto.businessName || !dto.vendorType || !isVendorType(dto.vendorType)) {
        throw new BadRequestException({
          code: ERROR_CODES.VENDOR_PROFILE_REQUIRED,
          message: 'businessName and valid vendorType are required for vendors',
        });
      }
      if (dto.nationalId && !this.isValidIranianNationalId(dto.nationalId)) {
        throw new BadRequestException({
          code: ERROR_CODES.NATIONAL_ID_INVALID,
          message: 'Invalid Iranian national ID',
        });
      }

      if (dto.nationalId) {
        const existing = await this.prisma.vendorProfile.findUnique({
          where: { nationalId: dto.nationalId },
        });
        if (existing && existing.userId !== userId) {
          throw new ConflictException({
            code: ERROR_CODES.CONFLICT,
            message: 'National ID already registered',
          });
        }
      }

      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          role: 'VENDOR',
          firstName: dto.firstName ?? undefined,
          lastName: dto.lastName ?? undefined,
          vendorProfile: {
            upsert: {
              create: {
                businessName: dto.businessName,
                vendorType: dto.vendorType as VendorType,
                nationalId: dto.nationalId ?? null,
                description: dto.description ?? null,
                categoryTags: dto.categoryTags ?? [],
                isHomeBased: dto.isHomeBased ?? false,
                socialLinks: (dto.socialLinks ?? {}) as object,
                verificationStatus: 'PENDING',
              },
              update: {
                businessName: dto.businessName,
                vendorType: dto.vendorType as VendorType,
                nationalId: dto.nationalId ?? undefined,
                description: dto.description ?? undefined,
                categoryTags: dto.categoryTags ?? undefined,
                isHomeBased: dto.isHomeBased ?? undefined,
                socialLinks: (dto.socialLinks ?? undefined) as never,
              },
            },
          },
        },
        include: { vendorProfile: true },
      });

      return {
        user: this.toUserPublic(updated),
        vendorProfile: updated.vendorProfile
          ? this.toVendorPublic(updated.vendorProfile)
          : null,
      };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: 'CONSUMER',
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
      },
      include: { vendorProfile: true },
    });

    return {
      user: this.toUserPublic(updated),
      vendorProfile: updated.vendorProfile
        ? this.toVendorPublic(updated.vendorProfile)
        : null,
    };
  }

  /** Iranian national ID check-digit validation */
  isValidIranianNationalId(nid: string): boolean {
    if (!/^\d{10}$/.test(nid)) return false;
    const digits = nid.split('').map(Number);
    const check = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }
    const rem = sum % 11;
    return (rem < 2 && check === rem) || (rem >= 2 && check === 11 - rem);
  }

  private toUserPublic(user: {
    id: string;
    phone: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    isPhoneVerified: boolean;
    createdAt: Date;
  }): UserPublic {
    return {
      id: user.id,
      phone: user.phone,
      role: user.role as Role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      isPhoneVerified: user.isPhoneVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toVendorPublic(profile: {
    id: string;
    businessName: string;
    vendorType: string;
    categoryTags: string[];
    nationalId: string | null;
    verificationStatus: string;
    description: string | null;
    socialLinks: unknown;
    isHomeBased: boolean;
  }): VendorProfilePublic {
    return {
      id: profile.id,
      businessName: profile.businessName,
      vendorType: profile.vendorType as VendorType,
      categoryTags: profile.categoryTags,
      nationalId: profile.nationalId,
      verificationStatus: profile.verificationStatus as VerificationStatus,
      description: profile.description,
      socialLinks: (profile.socialLinks ?? {}) as Record<string, string>,
      isHomeBased: profile.isHomeBased,
    };
  }

  normalizePhone(phone: string): string {
    return normalizeIrMobile(phone);
  }
}
