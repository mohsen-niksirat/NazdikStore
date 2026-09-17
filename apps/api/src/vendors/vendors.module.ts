import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsControllerExtra } from './vendors-location.controller';
import { VendorsService } from './vendors.service';
import { AuthModule } from '../auth/auth.module';
import { MapModule } from '../map/map.module';

@Module({
  imports: [AuthModule, MapModule],
  controllers: [VendorsController, VendorsControllerExtra],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
