/**
 * SMS providers for Iran — plug real APIs via env.
 *
 * SMS_PROVIDER=console|kavenegar|smsir
 * KAVENEGAR_API_KEY=...
 * SMSIR_API_KEY=... SMSIR_LINE_NUMBER=...
 */

export interface SmsTransport {
  readonly name: string;
  send(toE164OrLocal: string, text: string): Promise<void>;
}

export class ConsoleSmsTransport implements SmsTransport {
  readonly name = 'console';
  private readonly log: (msg: string) => void;

  constructor(log?: (msg: string) => void) {
    this.log = log || ((m) => console.log(m));
  }

  async send(to: string, text: string): Promise<void> {
    this.log(`[SMS console → ${to}] ${text}`);
  }
}

/** Kavenegar REST — https://kavenegar.com */
export class KavenegarSmsTransport implements SmsTransport {
  readonly name = 'kavenegar';

  constructor(
    private readonly apiKey: string,
    private readonly sender = process.env.KAVENEGAR_SENDER || '',
  ) {}

  async send(to: string, text: string): Promise<void> {
    if (!this.apiKey) throw new Error('KAVENEGAR_API_KEY missing');
    const receptor = to.replace(/^\+/, '');
    const url = new URL(`https://api.kavenegar.com/v1/${this.apiKey}/sms/send.json`);
    url.searchParams.set('receptor', receptor);
    url.searchParams.set('message', text);
    if (this.sender) url.searchParams.set('sender', this.sender);
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Kavenegar HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}

/** SMS.ir REST */
export class SmsIrTransport implements SmsTransport {
  readonly name = 'smsir';

  constructor(
    private readonly apiKey: string,
    private readonly lineNumber = process.env.SMSIR_LINE_NUMBER || '',
  ) {}

  async send(to: string, text: string): Promise<void> {
    if (!this.apiKey) throw new Error('SMSIR_API_KEY missing');
    // Production: obtain token then POST /v1/send/bulk with template
    const res = await fetch('https://api.sms.ir/v1/send/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        lineNumber: this.lineNumber,
        messageText: text,
        mobiles: [to.replace(/^\+/, '')],
      }),
    });
    if (!res.ok) {
      throw new Error(`SMS.ir HTTP ${res.status}`);
    }
  }
}

export function createSmsTransport(provider = process.env.SMS_PROVIDER || 'console'): SmsTransport {
  switch ((provider || 'console').toLowerCase()) {
    case 'kavenegar':
      return new KavenegarSmsTransport(process.env.KAVENEGAR_API_KEY || '');
    case 'smsir':
      return new SmsIrTransport(process.env.SMSIR_API_KEY || '', process.env.SMSIR_LINE_NUMBER);
    default:
      return new ConsoleSmsTransport();
  }
}
