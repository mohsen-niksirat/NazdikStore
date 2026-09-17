import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OtpService } from '../src/auth/otp.service';
import { RedisService } from '../src/redis/redis.service';
import { SmsService } from '../src/auth/sms.service';

describe('OtpService', () => {
  let otp: OtpService;
  let redis: RedisService;
  let sms: { sendOtp: jest.Mock };

  beforeEach(async () => {
    process.env.REDIS_URL = '';
    process.env.OTP_MAX_PER_WINDOW = '3';
    process.env.OTP_WINDOW_SECONDS = '300';
    process.env.OTP_TTL_SECONDS = '120';
    process.env.OTP_LENGTH = '5';

    sms = { sendOtp: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        RedisService,
        { provide: SmsService, useValue: sms },
      ],
    }).compile();

    otp = moduleRef.get(OtpService);
    redis = moduleRef.get(RedisService);
    redis.clearMemory();
  });

  it('issues a 5-digit OTP and sends SMS', async () => {
    const res = await otp.requestOtp('09123456789', '1.2.3.4');
    expect(res.phone).toBe('09123456789');
    expect(res.expiresInSeconds).toBe(120);
    expect(sms.sendOtp).toHaveBeenCalledWith('09123456789', expect.stringMatching(/^\d{5}$/));

    const code = await otp.peekOtp('09123456789');
    expect(code).toMatch(/^\d{5}$/);
  });

  it('rejects invalid phone format', async () => {
    await expect(otp.requestOtp('08123456789', '1.2.3.4')).rejects.toThrow(BadRequestException);
  });

  it('rate-limits after 3 requests per phone (brute-force protection)', async () => {
    await otp.requestOtp('09123456789', '1.2.3.4');
    await otp.requestOtp('09123456789', '1.2.3.4');
    await otp.requestOtp('09123456789', '1.2.3.4');

    await expect(otp.requestOtp('09123456789', '1.2.3.4')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'OTP_RATE_LIMITED',
      }),
    });
  });

  it('rate-limits by IP independently', async () => {
    await otp.requestOtp('09123456789', '10.0.0.1');
    await otp.requestOtp('09123456788', '10.0.0.1');
    await otp.requestOtp('09123456787', '10.0.0.1');

    await expect(otp.requestOtp('09123456786', '10.0.0.1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OTP_RATE_LIMITED' }),
    });
  });

  it('verifies correct OTP and deletes it (single-use)', async () => {
    await otp.requestOtp('09123456789', '1.2.3.4');
    const code = await otp.peekOtp('09123456789');
    const result = await otp.verifyOtp('09123456789', code!);
    expect(result.phone).toBe('09123456789');
    expect(await otp.peekOtp('09123456789')).toBeNull();

    await expect(otp.verifyOtp('09123456789', code!)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OTP_NOT_FOUND' }),
    });
  });

  it('rejects wrong OTP', async () => {
    await otp.requestOtp('09123456789', '1.2.3.4');
    const code = await otp.peekOtp('09123456789');
    const wrong = code === '00000' ? '11111' : '00000';
    await expect(otp.verifyOtp('09123456789', wrong)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OTP_INVALID' }),
    });
  });

  it('expires OTP after TTL', async () => {
    jest.useFakeTimers();
    try {
      await otp.requestOtp('09123456789', '1.2.3.4');
      const code = await otp.peekOtp('09123456789');
      jest.advanceTimersByTime(121_000);
      // memory TTL is time-based on Date.now
      await expect(otp.verifyOtp('09123456789', code!)).rejects.toMatchObject({
        response: expect.objectContaining({ code: expect.stringMatching(/OTP_/) }),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
