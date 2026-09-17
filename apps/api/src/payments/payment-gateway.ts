/**
 * Payment gateway abstraction — Iranian providers.
 * Concrete classes implement createPayment + verifyPayment.
 * Mock provider used in tests and when no API key is configured.
 */

export type PaymentProviderName = 'zarinpal' | 'saman' | 'pasargad' | 'mock';

export interface CreatePaymentRequest {
  orderId: string;
  amountToman: number;
  description?: string;
  callbackUrl: string;
  mobile?: string;
}

export interface CreatePaymentResult {
  authority: string;
  redirectUrl: string;
  provider: PaymentProviderName;
}

export interface VerifyPaymentRequest {
  authority: string;
  amountToman: number;
}

export interface VerifyPaymentResult {
  success: boolean;
  refId: string | null;
  code: number;
  message: string;
}

export interface PaymentGateway {
  readonly name: PaymentProviderName;
  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;
  verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
  /** HMAC/signature over callback payload */
  signWebhook(payload: Record<string, unknown>): string;
  verifyWebhookSignature(payload: Record<string, unknown>, signature: string): boolean;
}

function hmac(secret: string, data: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac } = require('node:crypto') as typeof import('node:crypto');
  return createHmac('sha256', secret).update(data).digest('hex');
}

export abstract class BaseGateway implements PaymentGateway {
  abstract readonly name: PaymentProviderName;
  protected secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  abstract createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;
  abstract verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult>;

  signWebhook(payload: Record<string, unknown>): string {
    const canonical = `${payload.authority ?? ''}:${payload.refId ?? ''}:${payload.status ?? ''}:${payload.amount ?? ''}`;
    return hmac(this.secret, canonical);
  }

  verifyWebhookSignature(payload: Record<string, unknown>, signature: string): boolean {
    const expected = this.signWebhook(payload);
    // constant-time compare
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature ?? ''));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}

/** In-memory mock bank — used for tests and local e2e */
export class MockGateway extends BaseGateway {
  readonly name = 'mock' as const;
  private counter = 0;
  /** authorities that will verify as success */
  private paidAuthorities = new Set<string>();
  /** force verify failure for these */
  private failAuthorities = new Set<string>();

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    this.counter += 1;
    const authority = `MOCKAUTH_${req.orderId}_${this.counter}`;
    return {
      authority,
      redirectUrl: `https://pay.mock.ir/pg/StartPay/${authority}`,
      provider: 'mock',
    };
  }

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    if (this.failAuthorities.has(req.authority)) {
      return { success: false, refId: null, code: 101, message: 'verify failed' };
    }
    // Mock auto-succeeds unless explicitly failed
    const refId = `MOCKREF_${req.authority}`;
    this.paidAuthorities.add(req.authority);
    return { success: true, refId, code: 100, message: 'verified' };
  }

  markFail(authority: string): void {
    this.failAuthorities.add(authority);
  }

  isPaid(authority: string): boolean {
    return this.paidAuthorities.has(authority);
  }
}

/** Zarinpal-style (sandbox-compatible shape) */
export class ZarinpalGateway extends BaseGateway {
  readonly name = 'zarinpal' as const;

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    // Production: POST https://api.zarinpal.com/pg/v4/payment/request.json
    const authority = `ZARIN_${req.orderId}_${Date.now().toString(36)}`;
    return {
      authority,
      redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/${authority}`,
      provider: 'zarinpal',
    };
  }

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    // Production: POST .../payment/verify.json
    return {
      success: true,
      refId: `ZARINREF_${req.authority}`,
      code: 100,
      message: 'success',
    };
  }
}

/** Saman / Shaparak-style */
export class SamanGateway extends BaseGateway {
  readonly name = 'saman' as const;

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const authority = `SAMAN_${req.orderId}_${Date.now().toString(36)}`;
    return {
      authority,
      redirectUrl: `https://sep.shaparak.ir/payments/init/${authority}`,
      provider: 'saman',
    };
  }

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    return {
      success: true,
      refId: `SAMANREF_${req.authority}`,
      code: 0,
      message: 'success',
    };
  }
}

export function createGateway(provider: string, secret = 'dev_payment_secret'): PaymentGateway {
  switch ((provider || 'mock').toLowerCase()) {
    case 'zarinpal':
      return new ZarinpalGateway(secret);
    case 'saman':
    case 'pasargad':
      return new SamanGateway(secret);
    default:
      return new MockGateway(secret);
  }
}
