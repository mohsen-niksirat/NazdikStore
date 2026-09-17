import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  connected = false;

  async onModuleInit() {
    try {
      await this.$connect();
      this.connected = true;
    } catch (err) {
      this.connected = false;
      const offline = process.env.ALLOW_OFFLINE === '1' || process.env.NODE_ENV !== 'production';
      this.logger.warn(
        `Prisma/Postgres unavailable (${(err as Error).message}). ` +
          (offline
            ? 'Continuing in offline memory mode — map/feed/auth engines use in-memory stores.'
            : 'Refusing to start.'),
      );
      if (!offline) throw err;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      /* ignore */
    }
  }
}
