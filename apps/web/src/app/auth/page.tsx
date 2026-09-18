'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

type Step = 'phone' | 'otp' | 'profile';

type ApiError = {
  code?: string;
  message?: string;
  details?: { retryAfterSeconds?: number };
};

const VENDOR_TYPES = [
  { value: 'MEDICAL', label: 'پزشکی / ویزیت' },
  { value: 'FOOD', label: 'غذا / آشپزخانه' },
  { value: 'ECOMMERCE', label: 'فروشگاهی' },
  { value: 'FIELD_SERVICE', label: 'خدمات میدانی' },
  { value: 'BEAUTY', label: 'زیبایی' },
] as const;

function formatFaCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AuthPage() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('09123456789');
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
      setError('ارتباط با سرور برقرار نشد. API روی پورت ۴۰۰۰ بالا باشد.');
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
          ? 'پروفایل فروشنده ثبت شد.'
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

  return (
    <main className="page page-center">
      <div className="top-nav">
        <div className="brand">
          <div className="chip-proximity">
            <MapPin aria-hidden />
            نزدیک استور
          </div>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      <section className="card card-hero" aria-live="polite">
        {successMsg ? (
          <div className="stack-4 center">
            <h1 className="h1 text-accent">موفق</h1>
            <p className="body-muted">{successMsg}</p>
            <Link href="/map" className="btn-primary">
              رفتن به نقشه
            </Link>
          </div>
        ) : step === 'phone' ? (
          <div className="stack-4">
            <div>
              <h1 className="h1">ورود / ثبت‌نام</h1>
              <p className="body-muted mt-2">شماره موبایل را وارد کنید تا کد تایید پیامک شود.</p>
            </div>
            <form
              className="stack-3"
              onSubmit={(e) => {
                e.preventDefault();
                void requestOtp(phone);
              }}
            >
              <div className="field">
                <label htmlFor="phone">شماره موبایل</label>
                <input
                  id="phone"
                  className="input-field"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="09123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 style={{ width: 16, height: 16 }} aria-hidden />
                    در حال ارسال…
                  </>
                ) : (
                  'ارسال کد تایید'
                )}
              </button>
              <p className="caption center">کد در ترمینال API چاپ می‌شود (پیامک واقعی نداریم).</p>
            </form>
          </div>
        ) : step === 'otp' ? (
          <div className="stack-4">
            <div className="row-between">
              <div>
                <h1 className="h1">کد تایید</h1>
                <p className="mono text-muted mt-1" dir="ltr">
                  {maskedPhone || phone}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setStep('phone');
                  setOtp(['', '', '', '', '']);
                  setError(null);
                }}
              >
                ویرایش
              </button>
            </div>

            <div className="otp-row">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  aria-label={`رقم ${i + 1}`}
                />
              ))}
            </div>

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              disabled={loading || otpValue.length !== 5}
              onClick={() => void verifyOtp()}
            >
              {loading ? 'در حال بررسی…' : 'ورود'}
            </button>

            <div className="countdown">
              {countdown > 0 ? (
                <span>
                  ارسال مجدد تا <span className="num">{formatFaCountdown(countdown)}</span>
                </span>
              ) : (
                <button type="button" className="btn-ghost" onClick={() => void requestOtp(phone)}>
                  ارسال مجدد کد
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="stack-4">
            <div>
              <h1 className="h1">تکمیل پروفایل</h1>
              <p className="body-muted mt-2">نقش خود را انتخاب کنید.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'CONSUMER', label: 'مشتری' },
                  { value: 'VENDOR', label: 'فروشنده' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={role === opt.value ? 'pill active' : 'pill'}
                  style={{ minHeight: 48 }}
                  onClick={() => setRole(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="field">
                <label>نام</label>
                <input className="input-field" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>نام خانوادگی</label>
                <input className="input-field" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            {role === 'VENDOR' && (
              <div className="stack-3">
                <div className="field">
                  <label>نام کسب‌وکار</label>
                  <input
                    className="input-field"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>نوع فعالیت</label>
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
                </div>
              </div>
            )}

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              disabled={loading || (role === 'VENDOR' && !businessName.trim())}
              onClick={() => void completeProfile()}
            >
              {loading ? 'در حال ذخیره…' : 'تکمیل پروفایل'}
            </button>
          </div>
        )}
      </section>

      <p className="footer-note">کد OTP را از لاگ ترمینال API بخوانید</p>
    </main>
  );
}
