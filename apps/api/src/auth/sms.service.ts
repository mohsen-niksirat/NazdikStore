import { Injectable, Logger } from '@nestjs/common';
import { toE164IrMobile } from '@nazdik/shared';

export interface SmsProvider {
  send(to: string, text: string): Promise<void>;
}

/** Dev provider: logs OTP to console. Swap for Kavenegar / SMS.ir / etc. */
class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('ConsoleSms');

  async send(to: string, text: string): Promise<void> {
    this.logger.log(`[SMS → ${to}] ${text}`);
  }
}

@Injectable()
export class SmsService {
  private readonly provider: SmsProvider;
  private readonly logger = new Logger(SmsService.name);

  constructor() {
    const kind = (process.env.SMS_PROVIDER ?? 'console').toLowerCase();
    // Production providers plug in here (Kavenegar, SMS.ir, Ghasedak…)
    this.provider = new ConsoleSmsProvider();
    this.logger.log(`SMS provider: ${kind}`);
  }

  async sendOtp(phoneLocal: string, code: string): Promise<void> {
    const e164 = toE164IrMobile(phoneLocal);
    const text = `نزدیک استور: کد تایید شما ${code} است. این کد تا ۲ دقیقه معتبر است.`;
    await this.provider.send(e164, text);
  }
}
