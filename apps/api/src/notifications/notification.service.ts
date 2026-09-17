import { Injectable, Logger } from '@nestjs/common';

export interface NotificationPayload {
  userId: string;
  channel: 'websocket' | 'push' | 'sms';
  topic: string;
  payload: Record<string, unknown>;
}

export interface StoredNotification extends NotificationPayload {
  id: string;
  createdAt: string;
}

/**
 * Real-time notification engine.
 * WebSocket-style in-process bus + push/SMS hooks.
 * Production: bind to @nestjs/websockets gateway + Web Push service worker.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private subscribers = new Map<string, Set<(n: StoredNotification) => void>>();
  private logs: StoredNotification[] = [];

  clearMemory(): void {
    this.subscribers.clear();
    this.logs = [];
  }

  /** Subscribe a client (WebSocket connection / test listener) */
  subscribe(userId: string, handler: (n: StoredNotification) => void): () => void {
    let set = this.subscribers.get(userId);
    if (!set) {
      set = new Set();
      this.subscribers.set(userId, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  notify(input: NotificationPayload): StoredNotification {
    const record: StoredNotification = {
      ...input,
      id: `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.logs.push(record);

    const handlers = this.subscribers.get(input.userId);
    if (handlers) {
      for (const h of handlers) {
        try {
          h(record);
        } catch (err) {
          this.logger.warn(`notify handler error: ${(err as Error).message}`);
        }
      }
    }

    // Push stub: production would call web-push / FCM
    if (input.channel === 'push') {
      this.logger.log(`[PUSH] ${input.userId} ${input.topic}`);
    }

    return record;
  }

  /** Broadcast to all vendor subscribers (new job in perimeter) */
  broadcastVendors(topic: string, payload: Record<string, unknown>): number {
    let n = 0;
    for (const [userId, handlers] of this.subscribers.entries()) {
      if (!userId.startsWith('vp_') && !userId.startsWith('vendor')) continue;
      const record: StoredNotification = {
        userId,
        channel: 'websocket',
        topic,
        payload,
        id: `notif_b_${Date.now().toString(36)}_${n}`,
        createdAt: new Date().toISOString(),
      };
      this.logs.push(record);
      for (const h of handlers) {
        try {
          h(record);
        } catch {
          /* ignore */
        }
      }
      n += 1;
    }
    return n;
  }

  history(userId: string, limit = 50): StoredNotification[] {
    return this.logs
      .filter((l) => l.userId === userId)
      .slice(-limit)
      .reverse();
  }

  allLogs(): StoredNotification[] {
    return [...this.logs];
  }
}
