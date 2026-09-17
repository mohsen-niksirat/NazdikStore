import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_CODES } from '@nazdik/shared';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vendorProfile: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'User not found',
      });
    }
    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      isPhoneVerified: user.isPhoneVerified,
      createdAt: user.createdAt,
      vendorProfile: user.vendorProfile
        ? {
            id: user.vendorProfile.id,
            businessName: user.vendorProfile.businessName,
            vendorType: user.vendorProfile.vendorType,
            categoryTags: user.vendorProfile.categoryTags,
            verificationStatus: user.vendorProfile.verificationStatus,
            description: user.vendorProfile.description,
            isHomeBased: user.vendorProfile.isHomeBased,
            socialLinks: user.vendorProfile.socialLinks,
          }
        : null,
    };
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; avatarUrl?: string },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { vendorProfile: true },
    });
    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
    };
  }
}
