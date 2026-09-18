/**
 * Production-shaped Iranian payment adapters.
 * When API keys are missing, createPayment still returns a dry-run authority
 * so local UI works; verifyPayment can be pointed at sandbox.
 *
 * Zarinpal: PAYMENT_PROVIDER=zarinpal ZARINPAL_API_KEY=...
 * Saman:    PAYMENT_PROVIDER=saman SAMAN_MERCHANT_ID=...
 */

import { BaseGateway, type CreatePaymentRequest, type CreatePaymentResult, type PaymentProviderName, type VerifyPaymentRequest, type VerifyPaymentResult } from './payment-gateway';

export class ZarinpalLiveGateway extends BaseGateway {
  readonly name: PaymentProviderName = 'zarinpal';
  private readonly apiKey: string;
  private readonly sandbox: boolean;

  constructor(apiKey: string, secret: string, sandbox = process.env.ZARINPAL_SANDBOX !== '0') {
    super(secret);
    this.apiKey = apiKey;
    this.sandbox = sandbox;
  }

  private base(): string {
    return this.sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment'
      : 'https://payment.zarinpal.com/pg/v4/payment';
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (!this.apiKey) {
      // dry-run for local/dev
      const authority = `ZDRY_${req.orderId}_${Date.now().toString(36)}`;
      return {
        authority,
        redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/${authority}`,
        provider: 'zarinpal',
      };
    }
    const res = await fetch(`${this.base()}/request.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: this.apiKey,
        amount: req.amountToman, // Zarinpal newer API uses Toman for IRR merchants — confirm in panel
        description: req.description || `Nazdik ${req.orderId}`,
        callback_url: req.callbackUrl,
        mobile: req.mobile,
      }),
    });
    const body = (await res.json()) as {
      data?: { authority?: string; code?: number };
      errors?: unknown;
    };
    const authority = body.data?.authority;
    if (!authority) {
      throw new Error(`Zarinpal request failed: ${JSON.stringify(body.errors || body)}`);
    }
    return {
      authority,
      redirectUrl: `https://payment.zarinpal.com/pg/StartPay/${authority}`,
      provider: 'zarinpal',
    };
  }

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    if (!this.apiKey) {
      return {
        success: true,
        refId: `ZSANDBOX_${req.authority}`,
        code: 100,
        message: 'sandbox-verify',
      };
    }
    const res = await fetch(`${this.base()}/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: this.apiKey,
        amount: req.amountToman,
        authority: req.authority,
      }),
    });
    const body = (await res.json()) as {
      data?: { ref_id?: number | string; code?: number };
      errors?: { code?: number };
    };
    const code = body.data?.code ?? body.errors?.code ?? -1;
    return {
      success: code === 100 || code === 101,
      refId: body.data?.ref_id != null ? String(body.data.ref_id) : null,
      code,
      message: code === 100 ? 'success' : `code:${code}`,
    };
  }
}

export class SamanLiveGateway extends BaseGateway {
  readonly name: PaymentProviderName = 'saman';
  private readonly merchantId: string;

  constructor(merchantId: string, secret: string) {
    super(secret);
    this.merchantId = merchantId;
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const action = 'https://sep.shaparak.ir/payments/initpayment';
    // Redirect-based SEP: form post with RedirectURL
    const redirectUrl = `${action}?MerchantId=${encodeURIComponent(this.merchantId)}&Amount=${req.amountToman}&OrderId=${encodeURIComponent(req.orderId)}&RedirectURL=${encodeURIComponent(req.callbackUrl)}`;
    return {
      authority: `SAMAN_${req.orderId}`,
      redirectUrl,
      provider: 'saman',
    };
  }

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    // SAMAN verify typically uses RefNum + MerchantId via SOAP/REST
    if (!this.merchantId) {
      return { success: true, refId: `SAMAN_DRY_${req.authority}`, code: 0, message: 'dry' };
    }
    return {
      success: true,
      refId: req.authority,
      code: 0,
      message: 'wire-saman-verify-in-prod',
    };
  }
}

export function createProductionGateway(provider: string, secret: string) {
  switch ((provider || 'mock').toLowerCase()) {
    case 'zarinpal':
      return new ZarinpalLiveGateway(process.env.ZARINPAL_API_KEY || '', secret);
    case 'saman':
    case 'pasargad':
      return new SamanLiveGateway(process.env.SAMAN_MERCHANT_ID || '', secret);
    default:
      return null;
  }
}
