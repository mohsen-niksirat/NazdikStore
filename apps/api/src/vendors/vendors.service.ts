import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { VendorType } from '@nazdik/shared';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public directory listing — nationalId stripped, PII minimized.
   * Phase 2 will add PostGIS radius filtering.
   */
  async listPublic(params: { vendorType?: VendorType; limit?: number }) {
    const limit = Math.min(params.limit ?? 20, 50);
    const vendors = await this.prisma.vendorProfile.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        ...(params.vendorType ? { vendorType: params.vendorType } : {}),
        user: { isActive: true, role: 'VENDOR' },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    return vendors.map((v) => ({
      id: v.id,
      businessName: v.businessName,
      vendorType: v.vendorType,
      categoryTags: v.categoryTags,
      description: v.description,
      isHomeBased: v.isHomeBased,
      verificationStatus: v.verificationStatus,
      owner: v.user,
    }));
  }
}
