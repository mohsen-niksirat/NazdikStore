export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  PHONE_INVALID: 'PHONE_INVALID',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  VENDOR_PROFILE_REQUIRED: 'VENDOR_PROFILE_REQUIRED',
  NATIONAL_ID_INVALID: 'NATIONAL_ID_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  messageEn?: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
}

export const ERROR_MESSAGES_FA: Record<string, string> = {
  VALIDATION_FAILED: 'اطلاعات واردشده معتبر نیست.',
  UNAUTHORIZED: 'برای ادامه وارد شوید.',
  FORBIDDEN: 'دسترسی لازم را ندارید.',
  NOT_FOUND: 'موردی یافت نشد.',
  CONFLICT: 'این عملیات قبلاً انجام شده یا با وضعیت فعلی ناسازگار است.',
  OTP_RATE_LIMITED: 'تعداد درخواست‌ها زیاد است. لطفاً بعداً دوباره تلاش کنید.',
  OTP_INVALID: 'کد تایید نادرست است.',
  OTP_EXPIRED: 'کد تایید منقضی شده است. کد جدید بگیرید.',
  OTP_NOT_FOUND: 'کد تاییدی برای این شماره ثبت نشده است.',
  PHONE_INVALID: 'شماره موبایل معتبر نیست. نمونه: ۰۹۱۲۳۴۵۶۷۸۹',
  TOKEN_INVALID: 'نشست شما معتبر نیست. دوباره وارد شوید.',
  TOKEN_EXPIRED: 'نشست شما منقضی شده است.',
  REFRESH_TOKEN_INVALID: 'امکان تمدید نشست وجود ندارد. دوباره وارد شوید.',
  VENDOR_PROFILE_REQUIRED: 'برای فروشندگان تکمیل پروفایل کسب‌وکار الزامی است.',
  NATIONAL_ID_INVALID: 'کد ملی معتبر نیست.',
  INTERNAL_ERROR: 'خطای داخلی سرور رخ داد.',
};

export const ERROR_MESSAGES_EN: Record<string, string> = {
  VALIDATION_FAILED: 'Validation failed.',
  UNAUTHORIZED: 'Authentication required.',
  FORBIDDEN: 'You do not have permission.',
  NOT_FOUND: 'Resource not found.',
  CONFLICT: 'Conflict with current state.',
  OTP_RATE_LIMITED: 'Too many requests. Try again later.',
  OTP_INVALID: 'Invalid verification code.',
  OTP_EXPIRED: 'Verification code expired.',
  OTP_NOT_FOUND: 'No verification code found for this number.',
  PHONE_INVALID: 'Invalid Iranian mobile number.',
  TOKEN_INVALID: 'Invalid session.',
  TOKEN_EXPIRED: 'Session expired.',
  REFRESH_TOKEN_INVALID: 'Unable to refresh session.',
  VENDOR_PROFILE_REQUIRED: 'Vendor business profile is required.',
  NATIONAL_ID_INVALID: 'Invalid national ID.',
  INTERNAL_ERROR: 'Internal server error.',
};

export function buildErrorEnvelope(code: string, details?: unknown): ApiEnvelope<never> {
  return {
    success: false,
    error: {
      code,
      message: ERROR_MESSAGES_FA[code] ?? ERROR_MESSAGES_FA.INTERNAL_ERROR,
      messageEn: ERROR_MESSAGES_EN[code] ?? ERROR_MESSAGES_EN.INTERNAL_ERROR,
      details,
    },
  };
}
