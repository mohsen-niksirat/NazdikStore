import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WalletService } from './wallet.service';
import { IdempotencyService } from './idempotency.service';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, OrdersModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WalletService, IdempotencyService],
  exports: [PaymentsService, WalletService, IdempotencyService],
})
export class PaymentsModule {}
