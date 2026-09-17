import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import { SmsService } from './sms.service';
import {
  ERROR_CODES,
  formatIrMobileDisplay,
  isValidIrMobile,
  maskIrMobile,
  normalizeIrMobile,
} from '@nazdik/shared';
import type { RequestOtpResponse } from '@nazdik/shared';

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

const MAX_VERIFY_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly sms: SmsService,
  ) {}

  private get ttlSeconds(): number {
    return Number(process.env.OTP_TTL_SECONDS ?? 120);
  }

  private get length(): number {
    return Number(process.env.OTP_LENGTH ?? 5);
  }

  private get maxPerWindow(): number {
    return Number(process.env.OTP_MAX_PER_WINDOW ?? 3);
  }

  private get windowSeconds(): number {
    return Number(process.env.OTP_WINDOW_SECONDS ?? 300);
  }

  async requestOtp(rawPhone: string, ip: string): Promise<RequestOtpResponse> {
    if (!isValidIrMobile(rawPhone)) {
      throw new BadRequestException({
        code: ERROR_CODES.PHONE_INVALID,
        message: 'Invalid Iranian mobile number',
      });
    }

    const phone = normalizeIrMobile(rawPhone);

    // Rate limit per phone number AND per IP (sliding window)
    const phoneLimit = await this.redis.slidingWindowRateLimit({
      key: `otp:phone:${phone}`,
      limit: this.maxPerWindow,
      windowSeconds: this.windowSeconds,
    });
    const ipLimit = await this.redis.slidingWindowRateLimit({
      key: `otp:ip:${ip || 'unknown'}`,
      limit: this.maxPerWindow,
      windowSeconds: this.windowSeconds,
    });

    if (!phoneLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(
        phoneLimit.allowed ? 0 : phoneLimit.retryAfterSeconds,
        ipLimit.allowed ? 0 : ipLimit.retryAfterSeconds,
      );
      throw new BadRequestException({
        code: ERROR_CODES.OTP_RATE_LIMITED,
        message: 'OTP rate limit exceeded',
        details: { retryAfterSeconds: retryAfter },
      });
    }

    const code = this.generateSecureCode(this.length);
    const record: OtpRecord = {
      code,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
      attempts: 0,
    };
    await this.redis.set(this.otpKey(phone), JSON.stringify(record), this.ttlSeconds);
    await this.sms.sendOtp(phone, code);

    return {
      phone,
      maskedPhone: maskIrMobile(phone),
      expiresInSeconds: this.ttlSeconds,
      retryAfterSeconds: this.windowSeconds,
    };
  }

  async verifyOtp(rawPhone: string, code: string): Promise<{ phone: string }> {
    if (!isValidIrMobile(rawPhone)) {
      throw new BadRequestException({
        code: ERROR_CODES.PHONE_INVALID,
        message: 'Invalid Iranian mobile number',
      });
    }
    const phone = normalizeIrMobile(rawPhone);
    const raw = await this.redis.get(this.otpKey(phone));
    if (!raw) {
      throw new BadRequestException({
        code: ERROR_CODES.OTP_NOT_FOUND,
        message: 'No OTP found',
      });
    }

    let record: OtpRecord;
    try {
      record = JSON.parse(raw) as OtpRecord;
    } catch {
      throw new BadRequestException({
        code: ERROR_CODES.OTP_NOT_FOUND,
        message: 'OTP payload invalid',
      });
    }

    if (record.expiresAt < Date.now()) {
      await this.redis.del(this.otpKey(phone));
      throw new BadRequestException({
        code: ERROR_CODES.OTP_EXPIRED,
        message: 'OTP expired',
      });
    }

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(this.otpKey(phone));
      throw new BadRequestException({
        code: ERROR_CODES.OTP_INVALID,
        message: 'Too many verification attempts',
        details: { reason: 'ATTEMPTS_EXCEEDED' },
      });
    }

    if (!this.constantTimeEquals(record.code, code)) {
      record.attempts += 1;
      const remainingTtl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
      await this.redis.set(this.otpKey(phone), JSON.stringify(record), remainingTtl);
      throw new BadRequestException({
        code: ERROR_CODES.OTP_INVALID,
        message: 'Invalid OTP',
        details: { remainingAttempts: MAX_VERIFY_ATTEMPTS - record.attempts },
      });
    }

    // Single-use: delete after success
    await this.redis.del(this.otpKey(phone));
    return { phone };
  }

  /** Exposed for tests / admin tooling — never return to clients in prod */
  async peekOtp(phone: string): Promise<string | null> {
    const raw = await this.redis.get(this.otpKey(normalizeIrMobile(phone)));
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as OtpRecord).code;
    } catch {
      return null;
    }
  }

  private otpKey(phone: string): string {
    return `otp:${phone}`;
  }

  private generateSecureCode(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) {
      out += String(randomInt(0, 10));
    }
    // Avoid trivially guessable all-same codes
    if (/^(\d)\1+$/.test(out)) {
      return this.generateSecureCode(length);
    }
    return out;
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}

export function formatPhoneForSms(phone: string): string {
  return formatIrMobileDisplay(phone);
}
