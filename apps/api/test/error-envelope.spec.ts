import { ERROR_MESSAGES_FA, buildErrorEnvelope, ERROR_CODES } from '@nazdik/shared';

describe('Localized error envelopes', () => {
  it('returns Persian + English messages for known codes', () => {
    const env = buildErrorEnvelope(ERROR_CODES.OTP_RATE_LIMITED);
    expect(env.success).toBe(false);
    expect(env.error?.code).toBe('OTP_RATE_LIMITED');
    expect(env.error?.message).toContain('زیاد');
    expect(env.error?.messageEn).toContain('Too many');
  });

  it('falls back to internal error for unknown codes', () => {
    const env = buildErrorEnvelope('UNKNOWN_CODE_XYZ');
    expect(env.error?.message).toBe(ERROR_MESSAGES_FA.INTERNAL_ERROR);
  });

  it('includes details when provided', () => {
    const env = buildErrorEnvelope(ERROR_CODES.OTP_RATE_LIMITED, { retryAfterSeconds: 42 });
    expect(env.error?.details).toEqual({ retryAfterSeconds: 42 });
  });
});
