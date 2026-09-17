import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TimeSlotService } from './time-slot.service';
import { RfqService } from './rfq.service';
import { AuthModule } from '../auth/auth.module';
import { MapModule } from '../map/map.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [AuthModule, MapModule, ReviewsModule],
  controllers: [OrdersController],
  providers: [OrdersService, TimeSlotService, RfqService],
  exports: [OrdersService, TimeSlotService, RfqService],
})
export class OrdersModule {}
