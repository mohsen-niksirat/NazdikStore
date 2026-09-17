import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MapService } from './map.service';
import { Public } from '../common/decorators/roles.decorator';
import { RADIUS_PRESETS_KM, VENDOR_TYPES, type VendorType } from '@nazdik/shared';

@ApiTags('map')
@Controller('map')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Public()
  @Get('vendors')
  @ApiOperation({
    summary: 'Hyperlocal vendor map feed (bbox / radius / clustering / fuzzy locations)',
  })
  @ApiQuery({ name: 'bbox', required: false, description: 'minLng,minLat,maxLng,maxLat' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radiusKm', required: false, description: `presets: ${RADIUS_PRESETS_KM.join(', ')}` })
  @ApiQuery({ name: 'vendorType', required: false, enum: VENDOR_TYPES })
  @ApiQuery({ name: 'zoom', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'exact', required: false, description: '1 = disable clustering' })
  async vendors(
    @Query('bbox') bbox?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('vendorType') vendorType?: string,
    @Query('zoom') zoom?: string,
    @Query('limit') limit?: string,
    @Query('exact') exact?: string,
  ) {
    const validType =
      vendorType && (VENDOR_TYPES as readonly string[]).includes(vendorType)
        ? (vendorType as VendorType)
        : undefined;

    const data = await this.map.queryVendors({
      bbox,
      lat: lat != null && lat !== '' ? Number(lat) : undefined,
      lng: lng != null && lng !== '' ? Number(lng) : undefined,
      radiusKm: radiusKm != null && radiusKm !== '' ? Number(radiusKm) : undefined,
      vendorType: validType,
      zoom: zoom != null && zoom !== '' ? Number(zoom) : undefined,
      limit: limit != null && limit !== '' ? Number(limit) : undefined,
      exact: exact === '1' || exact === 'true',
    });

    return { success: true, data };
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Map client config (radius presets, default center, fuzzy radius)' })
  config() {
    return {
      success: true,
      data: {
        radiusPresetsKm: RADIUS_PRESETS_KM,
        fuzzyRadiusMeters: 200,
        defaultCenter: { lat: 35.6892, lng: 51.389 },
        defaultZoom: 13,
        vendorTypes: VENDOR_TYPES,
        tiles: process.env.MAP_TILES_URL ?? null,
      },
    };
  }
}
