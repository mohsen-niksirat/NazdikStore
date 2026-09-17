'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MapPin, Pencil } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Step = 'phone' | 'otp' | 'profile';

type ApiError = { code?: string; message?: string; messageEn?: string; details?: { retryAfterSeconds?: number } };

const VENDOR_TYPES = [
  { value: 'MEDICAL', label: 'پزشکی / ویزیت' },
  { value: 'FOOD', label: 'غذا / آشپزخانه' },
  { value: 'ECOMMERCE', label: 'فروشگاهی' },
  { value: 'FIELD_SERVICE', label: 'خدمات میدانی / تعمیر' },
  { value: 'BEAUTY', label: 'زیبایی / نوبت‌دهی' },
] as const;

function formatFaCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AuthPage() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [role, setRole] = useState<'CONSUMER' | 'VENDOR'>('CONSUMER');
  const [businessName, setBusinessName] = useState('');
  const [vendorType, setVendorType] = useState<string>('FOOD');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const otpValue = useMemo(() => otp.join(''), [otp]);

  const requestOtp = useCallback(async (rawPhone: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: rawPhone }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        const err = body.error as ApiError | undefined;
        const retry = err?.details?.retryAfterSeconds;
        setError(
          err?.code === 'OTP_RATE_LIMITED'
            ? `تعداد درخواست‌ها زیاد است${retry ? ` — ${retry} ثانیه دیگر` : ''}.`
            : err?.message ?? 'ارسال کد تایید ناموفق بود.',
        );
        return;
      }
      setMaskedPhone(body.data.maskedPhone);
      setPhone(body.data.phone);
      setCountdown(body.data.expiresInSeconds ?? 120);
      setStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError('ارتباط با سرور برقرار نشد. بعداً تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async () => {
    if (otpValue.length !== 5) {
      setError('کد تایید ۵ رقمی را کامل وارد کنید.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, code: otpValue }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        const err = body.error as ApiError | undefined;
        setError(err?.message ?? 'کد تایید نادرست است.');
        setOtp(['', '', '', '', '']);
        otpRefs.current[0]?.focus();
        return;
      }
      setAccessToken(body.data.tokens.accessToken);
      if (body.data.requiresProfileCompletion) {
        setStep('profile');
      } else {
        setSuccessMsg('ورود موفق بود. خوش آمدید!');
      }
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, [otpValue, phone]);

  const completeProfile = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        role,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      };
      if (role === 'VENDOR') {
        payload.businessName = businessName;
        payload.vendorType = vendorType;
      }
      const res = await fetch(`${API_URL}/api/v1/auth/profile/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError((body.error as ApiError | undefined)?.message ?? 'تکمیل پروفایل ناموفق بود.');
        return;
      }
      setSuccessMsg(
        role === 'VENDOR'
          ? 'پروفایل فروشنده ثبت شد. پس از تایید، در نقشه نزدیک نمایش داده می‌شوید.'
          : 'پروفایل شما آماده است.',
      );
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, role, businessName, vendorType, firstName, lastName]);

  function onOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 4) otpRefs.current[index + 1]?.focus();
  }

  function onOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-auth flex-col justify-center px-5 py-10">
      <header className="mb-8 text-center">
        <div className="mb-2 text-2xl font-bold">نزدیک استور</div>
        <div className="chip-proximity">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          فروشگاه‌های نزدیک شما
        </div>
      </header>

      <section className="card-auth" aria-live="polite">
        {successMsg ? (
          <div className="space-y-4 text-center">
            <div className="text-lg font-bold text-accent">موفق</div>
            <p className="text-sm leading-7 text-ink-muted">{successMsg}</p>
            <a href="/" className="btn-primary">
              بازگشت به خانه
            </a>
          </div>
        ) : step === 'phone' ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold">ورود / ثبت‌نام</h1>
              <p className="mt-2 text-sm text-ink-muted">
                شماره موبایل خود را وارد کنید تا کد تایید پیامک شود.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void requestOtp(phone);
              }}
              className="space-y-4"
            >
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">شماره موبایل</span>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  className="input-field text-left font-mono tracking-wide"
                  placeholder="09123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden />
                    در حال ارسال…
                  </>
                ) : (
                  'ارسال کد تایید'
                )}
              </button>
            </form>
          </div>
        ) : step === 'otp' ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">کد تایید</h1>
                <p className="mt-1 font-mono text-sm text-ink-muted" dir="ltr">
                  {maskedPhone || phone}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                onClick={() => {
                  setStep('phone');
                  setOtp(['', '', '', '', '']);
                  setError(null);
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                ویرایش
              </button>
            </div>

            <div className="flex justify-center gap-2" dir="ltr">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  className="input-field h-14 w-12 text-center font-mono text-2xl"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onKeyDown={(e) => onOtpKeyDown(i, e)}
                  aria-label={`رقم ${i + 1} کد تایید`}
                />
              ))}
            </div>

            {error && (
              <p role="alert" className="text-center text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn-primary"
              disabled={loading || otpValue.length !== 5}
              onClick={() => void verifyOtp()}
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden />
                  در حال بررسی…
                </>
              ) : (
                'ورود'
              )}
            </button>

            <div className="text-center text-sm text-ink-muted">
              {countdown > 0 ? (
                <span>
                  ارسال مجدد کد تا <span className="font-mono">{formatFaCountdown(countdown)}</span> دیگر
                </span>
              ) : (
                <button
                  type="button"
                  className="text-accent hover:underline"
                  disabled={loading}
                  onClick={() => void requestOtp(phone)}
                >
                  ارسال مجدد کد
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold">تکمیل پروفایل</h1>
              <p className="mt-2 text-sm text-ink-muted">نقش خود را انتخاب کنید.</p>
            </div>

            <div className="grid grid-cols-2 gap-2" role="group" aria-label="نقش">
              {(
                [
                  { value: 'CONSUMER', label: 'مشتری' },
                  { value: 'VENDOR', label: 'فروشنده' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`min-h-[48px] rounded-control border px-3 text-sm font-medium transition ${
                    role === opt.value
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-white text-ink'
                  }`}
                  onClick={() => setRole(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">نام</span>
                <input
                  className="input-field"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">نام خانوادگی</span>
                <input
                  className="input-field"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
            </div>

            {role === 'VENDOR' && (
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">نام کسب‌وکار</span>
                  <input
                    className="input-field"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">نوع فعالیت</span>
                  <select
                    className="input-field"
                    value={vendorType}
                    onChange={(e) => setVendorType(e.target.value)}
                  >
                    {VENDOR_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn-primary"
              disabled={loading || (role === 'VENDOR' && !businessName.trim())}
              onClick={() => void completeProfile()}
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden />
                  در حال ذخیره…
                </>
              ) : (
                'تکمیل پروفایل'
              )}
            </button>
          </div>
        )}
      </section>

      {step !== 'phone' && !successMsg && (
        <button
          type="button"
          className="mx-auto mt-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
          onClick={() => setStep(step === 'profile' ? 'otp' : 'phone')}
        >
          <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden />
          بازگشت
        </button>
      )}
    </main>
  );
}
