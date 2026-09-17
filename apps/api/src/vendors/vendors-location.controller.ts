import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { MapService } from '../map/map.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ERROR_CODES } from '@nazdik/shared';

class UpsertLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsString()
  @Matches(/^$|^.{0,200}$/, { message: 'address too long' })
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(50)
  serviceRadiusKm?: number;

  @IsOptional()
  @IsBoolean()
  isHomeBased?: boolean;
}

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendors')
export class VendorsControllerExtra {
  constructor(
    private readonly prisma: PrismaService,
    private readonly map: MapService,
  ) {}

  private async requireVendorProfile(userId: string) {
    const profile = await this.prisma.vendorProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ForbiddenException({
        code: ERROR_CODES.VENDOR_PROFILE_REQUIRED,
        message: 'Complete vendor profile first',
      });
    }
    return profile;
  }

  @Get('me/location')
  @ApiOperation({ summary: 'Get my vendor location' })
  async getMyLocation(@CurrentUser() user: AuthUser) {
    const profile = await this.requireVendorProfile(user.id);
    try {
      const loc = await this.prisma.vendorLocation.findUnique({
        where: { vendorProfileId: profile.id },
      });
      return {
        success: true,
        data: loc
          ? {
              lat: loc.lat,
              lng: loc.lng,
              address: loc.address,
              serviceRadiusKm: loc.serviceRadiusKm,
              isHomeBased: loc.isHomeBased,
              isActive: loc.isActive,
            }
          : null,
      };
    } catch {
      return { success: true, data: null };
    }
  }

  @Put('me/location')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update my vendor map pin' })
  async upsertMyLocation(@CurrentUser() user: AuthUser, @Body() dto: UpsertLocationDto) {
    const profile = await this.requireVendorProfile(user.id);
    const isHomeBased = dto.isHomeBased ?? profile.isHomeBased;
    const payload = {
      lat: dto.lat,
      lng: dto.lng,
      address: dto.address ?? null,
      serviceRadiusKm: dto.serviceRadiusKm ?? 3,
      isHomeBased,
    };

    try {
      const loc = await this.prisma.vendorLocation.upsert({
        where: { vendorProfileId: profile.id },
        create: { vendorProfileId: profile.id, ...payload },
        update: payload,
      });

      // Keep profile flag in sync
      if (profile.isHomeBased !== isHomeBased) {
        await this.prisma.vendorProfile.update({
          where: { id: profile.id },
          data: { isHomeBased },
        });
      }

      // Mirror into memory engine for offline/demo mode
      this.map.upsertMemory({
        id: loc.id,
        vendorProfileId: profile.id,
        businessName: profile.businessName,
        vendorType: profile.vendorType,
        categoryTags: profile.categoryTags,
        description: profile.description,
        verificationStatus: profile.verificationStatus,
        isHomeBased: loc.isHomeBased,
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address,
        serviceRadiusKm: loc.serviceRadiusKm,
      });

      return {
        success: true,
        data: {
          lat: loc.lat,
          lng: loc.lng,
          address: loc.address,
          serviceRadiusKm: loc.serviceRadiusKm,
          isHomeBased: loc.isHomeBased,
          isActive: loc.isActive,
          privacy: loc.isHomeBased
            ? {
                note: 'HOME_FUZZY',
                fuzzyRadiusMeters: 200,
                publicShowsExactPin: false,
              }
            : { note: 'PUBLIC_PIN' },
        },
      };
    } catch (err) {
      // Memory-only path when Prisma table missing
      const id = `mem_${profile.id}`;
      this.map.upsertMemory({
        id,
        vendorProfileId: profile.id,
        businessName: profile.businessName,
        vendorType: profile.vendorType,
        categoryTags: profile.categoryTags,
        description: profile.description,
        verificationStatus: profile.verificationStatus,
        isHomeBased,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address ?? null,
        serviceRadiusKm: dto.serviceRadiusKm ?? 3,
      });
      return {
        success: true,
        data: {
          lat: dto.lat,
          lng: dto.lng,
          address: dto.address ?? null,
          serviceRadiusKm: dto.serviceRadiusKm ?? 3,
          isHomeBased,
          isActive: true,
          storage: 'memory',
          privacy: isHomeBased
            ? { note: 'HOME_FUZZY', fuzzyRadiusMeters: 200, publicShowsExactPin: false }
            : { note: 'PUBLIC_PIN' },
        },
      };
    }
  }

  @Patch('me/location/privacy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle home-based fuzzy location mode' })
  async setPrivacy(@CurrentUser() user: AuthUser, @Body() body: { isHomeBased: boolean }) {
    const profile = await this.requireVendorProfile(user.id);
    const isHomeBased = Boolean(body?.isHomeBased);
    await this.prisma.vendorProfile
      .update({
        where: { id: profile.id },
        data: { isHomeBased },
      })
      .catch(() => undefined);

    try {
      await this.prisma.vendorLocation.updateMany({
        where: { vendorProfileId: profile.id },
        data: { isHomeBased },
      });
    } catch {
      /* memory mode */
    }

    return {
      success: true,
      data: {
        isHomeBased,
        fuzzyRadiusMeters: 200,
        note: isHomeBased
          ? 'Exact home coordinates are never returned to map clients.'
          : 'Your pin will appear publicly to nearby users.',
      },
    };
  }
}
