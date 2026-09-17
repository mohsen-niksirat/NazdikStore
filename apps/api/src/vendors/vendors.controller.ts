import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { Public } from '../common/decorators/roles.decorator';
import { VENDOR_TYPES, type VendorType } from '@nazdik/shared';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public verified vendor directory' })
  @ApiQuery({ name: 'vendorType', required: false, enum: VENDOR_TYPES })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('vendorType') vendorType?: string,
    @Query('limit') limit?: string,
  ) {
    const validType =
      vendorType && (VENDOR_TYPES as readonly string[]).includes(vendorType)
        ? (vendorType as VendorType)
        : undefined;
    const data = await this.vendors.listPublic({
      vendorType: validType,
      limit: limit ? Number(limit) : undefined,
    });
    return { success: true, data };
  }
}
