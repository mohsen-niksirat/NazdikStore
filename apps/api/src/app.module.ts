import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { MapModule } from './map/map.module';
import { MediaModule } from './media/media.module';
import { FeedModule } from './feed/feed.module';
import { ReviewsModule } from './reviews/reviews.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    VendorsModule,
    MapModule,
    MediaModule,
    FeedModule,
    ReviewsModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    HealthModule,
    SeedModule,
  ],
})
export class AppModule {}
