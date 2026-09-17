import { Controller, Get, Inject, Injectable, Module, Optional } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * WebSocket gateway facade.
 * When @nestjs/websockets is installed, replace with a real IoAdapter gateway.
 * This facade keeps the same publish/subscribe contract for app code.
 */
@Injectable()
export class RealtimeGateway {
  constructor(private readonly notifications: NotificationService) {}

  /** Emit to a user room */
  emitToUser(userId: string, topic: string, payload: Record<string, unknown>) {
    return this.notifications.notify({
      userId,
      channel: 'websocket',
      topic,
      payload,
    });
  }

  /** Emit to vendor perimeter (job RFQ, nearby orders) */
  emitToVendors(topic: string, payload: Record<string, unknown>) {
    return this.notifications.broadcastVendors(topic, payload);
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('health')
  health() {
    return {
      success: true,
      data: {
        transport: 'websocket-facade',
        push: 'stub',
        subscribers: true,
      },
    };
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationService, RealtimeGateway],
  exports: [NotificationService, RealtimeGateway],
})
export class NotificationsModule {}
