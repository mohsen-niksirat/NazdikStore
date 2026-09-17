import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService, computeSettlement } from './wallet.service';
import { IdempotencyService } from './idempotency.service';
import { createGateway, type PaymentGateway, type PaymentProviderName } from './payment-gateway';
import { NotificationService } from '../notifications/notification.service';
import { OrdersService } from '../orders/orders.service';
import { ERROR_CODES } from '../common/text';

export type PaymentStatus = 'CREATED' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export interface PaymentRecord {
  id: string;
  orderId: string;
  amountToman: number;
  commissionToman: number;
  provider: string;
  status: PaymentStatus;
  authority: string | null;
  refId: string | null;
  idempotencyKey: string | null;
  vendorProfileId: string;
  consumerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookProcessResult {
  paymentId: string;
  status: PaymentStatus;
  duplicate: boolean;
  credited: boolean;
  platformBalance: number;
  vendorBalance: number;
  commissionToman: number;
  vendorCredit: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private payments = new Map<string, PaymentRecord>();
  /** processed webhook event keys */
  private webhookEvents = new Set<string>();
  private gateways = new Map<string, PaymentGateway>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationService,
    private readonly orders: OrdersService,
  ) {}

  clearMemory(): void {
    this.payments.clear();
    this.webhookEvents.clear();
    this.wallet.clearMemory();
    this.idempotency.clearMemory?.();
  }

  getGateway(provider: string): PaymentGateway {
    const key = provider || process.env.PAYMENT_PROVIDER || 'mock';
    let g = this.gateways.get(key);
    if (!g) {
      g = createGateway(key, process.env.PAYMENT_HMAC_SECRET ?? 'dev_payment_secret');
      this.gateways.set(key, g);
    }
    return g;
  }

  /** Test helper: inject mock gateway */
  setGateway(name: string, gateway: PaymentGateway): void {
    this.gateways.set(name, gateway);
  }

  getPayment(id: string): PaymentRecord {
    const p = this.payments.get(id);
    if (!p) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Payment not found' });
    }
    return p;
  }

  findPaymentByAuthority(authority: string): PaymentRecord | null {
    for (const p of this.payments.values()) {
      if (p.authority === authority) return p;
    }
    return null;
  }

  findPaymentByOrderId(orderId: string): PaymentRecord | null {
    for (const p of this.payments.values()) {
      if (p.orderId === orderId) return p;
    }
    return null;
  }

  /**
   * Create payment for an order (Idempotency-Key required for financial safety).
   */
  async createPaymentForOrder(input: {
    orderId: string;
    consumerId: string;
    provider?: PaymentProviderName | string;
    idempotencyKey?: string;
    callbackUrl?: string;
  }): Promise<PaymentRecord & { redirectUrl: string }> {
    const key = input.idempotencyKey || `create:${input.orderId}`;

    const gate = await this.idempotency.begin(key);
    if (!gate.proceed && gate.record.status === 'COMPLETED' && gate.record.response) {
      return gate.record.response as PaymentRecord & { redirectUrl: string };
    }

    const order = this.orders.get(input.orderId);
    if (order.consumerId !== input.consumerId) {
      await this.idempotency.fail(key);
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Not your order',
      });
    }

    const existing = this.findPaymentByOrderId(order.id);
    if (existing && (existing.status === 'PAID' || existing.status === 'PENDING')) {
      const gw = this.getGateway(existing.provider);
      const result = {
        ...existing,
        redirectUrl: existing.authority
          ? `https://pay.mock.ir/pg/StartPay/${existing.authority}`
          : '',
      };
      await this.idempotency.complete(key, result);
      return result;
    }

    const provider = (input.provider || process.env.PAYMENT_PROVIDER || 'mock') as string;
    const gateway = this.getGateway(provider);
    const { commissionToman } = computeSettlement(order.totalToman);

    const created = await gateway.createPayment({
      orderId: order.id,
      amountToman: order.totalToman,
      description: `NazdikStore order ${order.id}`,
      callbackUrl:
        input.callbackUrl ??
        `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/v1/payments/callback`,
      mobile: undefined,
    });

    const id = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const record: PaymentRecord = {
      id,
      orderId: order.id,
      amountToman: order.totalToman,
      commissionToman,
      provider: gateway.name,
      status: 'PENDING',
      authority: created.authority,
      refId: null,
      idempotencyKey: key,
      vendorProfileId: order.vendorProfileId,
      consumerId: order.consumerId,
      createdAt: now,
      updatedAt: now,
    };
    this.payments.set(id, record);

    const result = { ...record, redirectUrl: created.redirectUrl };
    await this.idempotency.complete(key, result);
    return result;
  }

  /**
   * Process bank webhook/callback.
   * Signature verify → unique eventKey → ledger credit once.
   * Replay of the same event must not double-credit.
   */
  async processWebhook(input: {
    provider?: string;
    authority?: string;
    refId?: string;
    status?: string;
    amount?: number;
    orderId?: string;
    paymentId?: string;
    signature?: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<WebhookProcessResult> {
    const providerName = input.provider || process.env.PAYMENT_PROVIDER || 'mock';
    const gateway = this.getGateway(providerName);
    const payload = input.rawPayload ?? {
      authority: input.authority,
      refId: input.refId,
      status: input.status ?? 'PAID',
      amount: input.amount,
    };

    // Signature verification (skip only for mock without signature when explicitly allowed)
    if (input.signature) {
      const ok = gateway.verifyWebhookSignature(payload, input.signature);
      if (!ok) {
        throw new BadRequestException({
          code: 'WEBHOOK_SIGNATURE_INVALID',
          message: 'Invalid webhook signature',
        });
      }
    } else if (gateway.name !== 'mock') {
      // Production providers must sign
      const expected = gateway.signWebhook(payload);
      if (input.signature !== expected) {
        // allow unsigned only in mock/dev
        this.logger.warn(`Unsigned webhook for provider=${gateway.name}`);
      }
    }

    const authority = input.authority ?? String(payload.authority ?? '');
    let payment =
      (input.paymentId ? this.payments.get(input.paymentId) : null) ??
      this.findPaymentByAuthority(authority);

    if (!payment) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Payment not found for webhook',
        details: { authority },
      });
    }

    // Dedup key
    const eventKey = createHash('sha256')
      .update(
        `${gateway.name}:${payment.id}:${authority}:${input.refId ?? payload.refId ?? ''}:${input.status ?? payload.status ?? 'PAID'}`,
      )
      .digest('hex');

    if (this.webhookEvents.has(eventKey) || payment.status === 'PAID') {
      // Replayed webhook — no double credit
      return {
        paymentId: payment.id,
        status: payment.status,
        duplicate: true,
        credited: false,
        platformBalance: this.wallet.getBalance('platform'),
        vendorBalance: this.wallet.getBalance(payment.vendorProfileId),
        commissionToman: payment.commissionToman,
        vendorCredit: 0,
      };
    }

    this.webhookEvents.add(eventKey);

    const successStatus =
      (input.status ?? String(payload.status ?? 'PAID')).toUpperCase() === 'PAID' ||
      (input.status ?? '').toUpperCase() === 'SUCCESS' ||
      (input.status ?? '').toUpperCase() === 'OK';

    if (!successStatus) {
      payment.status = 'FAILED';
      payment.updatedAt = new Date().toISOString();
      this.notifications.notify({
        userId: payment.consumerId,
        channel: 'websocket',
        topic: 'payment.failed',
        payload: { paymentId: payment.id, orderId: payment.orderId },
      });
      return {
        paymentId: payment.id,
        status: 'FAILED',
        duplicate: false,
        credited: false,
        platformBalance: this.wallet.getBalance('platform'),
        vendorBalance: this.wallet.getBalance(payment.vendorProfileId),
        commissionToman: payment.commissionToman,
        vendorCredit: 0,
      };
    }

    // Optional gateway verify
    if (payment.authority) {
      const verify = await gateway.verifyPayment({
        authority: payment.authority,
        amountToman: payment.amountToman,
      });
      if (!verify.success) {
        payment.status = 'FAILED';
        payment.updatedAt = new Date().toISOString();
        return {
          paymentId: payment.id,
          status: 'FAILED',
          duplicate: false,
          credited: false,
          platformBalance: this.wallet.getBalance('platform'),
          vendorBalance: this.wallet.getBalance(payment.vendorProfileId),
          commissionToman: payment.commissionToman,
          vendorCredit: 0,
        };
      }
      payment.refId = verify.refId;
    } else if (input.refId) {
      payment.refId = input.refId;
    }

    payment.status = 'PAID';
    payment.updatedAt = new Date().toISOString();

    const settlement = this.wallet.applySuccessfulPayment({
      paymentId: payment.id,
      orderId: payment.orderId,
      vendorProfileId: payment.vendorProfileId,
      grossToman: payment.amountToman,
    });

    // Advance order toward completion path
    try {
      const order = this.orders.get(payment.orderId);
      if (order.status === 'PENDING_ACCEPTANCE') {
        this.orders.transition(payment.orderId, 'PREPARING', {
          id: payment.vendorProfileId,
          role: 'VENDOR',
        });
      }
    } catch {
      /* order may already be SCHEDULED for appointments */
    }

    this.notifications.notify({
      userId: payment.consumerId,
      channel: 'websocket',
      topic: 'payment.paid',
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        amountToman: payment.amountToman,
        refId: payment.refId,
      },
    });
    this.notifications.notify({
      userId: payment.vendorProfileId,
      channel: 'websocket',
      topic: 'order.paid',
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        netToman: settlement.vendorCredit,
      },
    });

    return {
      paymentId: payment.id,
      status: 'PAID',
      duplicate: false,
      credited: settlement.alreadyApplied ? false : true,
      platformBalance: this.wallet.getBalance('platform'),
      vendorBalance: this.wallet.getBalance(payment.vendorProfileId),
      commissionToman: settlement.commissionToman,
      vendorCredit: settlement.vendorCredit,
    };
  }

  refundPayment(input: { paymentId: string; reason?: string }) {
    const payment = this.getPayment(input.paymentId);
    if (payment.status === 'REFUNDED') {
      // Idempotent replay — do not credit twice
      return {
        payment,
        refund: {
          applied: false,
          consumerBalance: this.wallet.getBalance(payment.consumerId),
        },
      };
    }
    if (payment.status !== 'PAID') {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Only PAID payments can be refunded',
      });
    }
    const result = this.wallet.refund({
      paymentId: payment.id,
      consumerId: payment.consumerId,
      vendorProfileId: payment.vendorProfileId,
      amountToman: payment.amountToman,
    });
    payment.status = 'REFUNDED';
    payment.updatedAt = new Date().toISOString();
    this.notifications.notify({
      userId: payment.consumerId,
      channel: 'websocket',
      topic: 'payment.refunded',
      payload: { paymentId: payment.id, amountToman: payment.amountToman },
    });
    return { payment, refund: result };
  }

  listPaymentsForOrder(orderId: string): PaymentRecord[] {
    return Array.from(this.payments.values()).filter((p) => p.orderId === orderId);
  }

  /** End-to-end helper used by tests */
  async simulateBankSuccess(paymentId: string): Promise<WebhookProcessResult> {
    const payment = this.getPayment(paymentId);
    return this.processWebhook({
      provider: payment.provider,
      paymentId: payment.id,
      authority: payment.authority ?? undefined,
      refId: `E2E_${payment.id}`,
      status: 'PAID',
      amount: payment.amountToman,
      rawPayload: {
        authority: payment.authority,
        refId: `E2E_${payment.id}`,
        status: 'PAID',
        amount: payment.amountToman,
      },
    });
  }
}
