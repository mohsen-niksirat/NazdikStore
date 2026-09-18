'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const OFFLINE_HINT =
  'ارتباط با سرور برقرار نشد. API را بالا بیاورید: cd apps/api سپس npm run dev (پورت ۴۰۰۰)';

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
    const r = await apiFetch<{ phone: string; maskedPhone: string; expiresInSeconds?: number }>(
      '/auth/otp/request',
      { method: 'POST', body: JSON.stringify({ phone: rawPhone }) },
    );
    setLoading(false);
    if (!r.ok || !r.data) {
      setError(r.error || OFFLINE_HINT);
      return;
    }
    setMaskedPhone(r.data.maskedPhone);
    setPhone(r.data.phone);
    setCountdown(r.data.expiresInSeconds ?? 120);
    setStep('otp');
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  }, []);

  const verifyOtp = useCallback(async () => {
    if (otpValue.length !== 5) {
      setError('کد تایید ۵ رقمی را کامل وارد کنید.');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await apiFetch<{
      user: unknown;
      tokens: { accessToken: string };
      requiresProfileCompletion?: boolean;
    }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code: otpValue }),
    });
    setLoading(false);
    if (!r.ok || !r.data) {
      setError(r.error || OFFLINE_HINT);
      setOtp(['', '', '', '', '']);
      otpRefs.current[0]?.focus();
      return;
    }
    try {
      localStorage.setItem('nazdik_token', r.data.tokens.accessToken);
      localStorage.setItem('nazdik_user', JSON.stringify(r.data.user));
    } catch { /* ignore */ }
    setAccessToken(r.data.tokens.accessToken);
    if (r.data.requiresProfileCompletion) setStep('profile');
    else setSuccessMsg('ورود موفق بود. خوش آمدید!');
  }, [otpValue, phone]);

  const completeProfile = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    const payload: Record<string, unknown> = {
      role,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    };
    if (role === 'VENDOR') {
      payload.businessName = businessName;
      payload.vendorType = vendorType;
    }
    const r = await apiFetch('/auth/profile/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!r.ok) {
      setError(r.error || 'تکمیل پروفایل ناموفق بود.');
      return;
    }
    setSuccessMsg(role === 'VENDOR' ? 'پروفایل فروشنده ثبت شد.' : 'پروفایل شما آماده است.');
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
            <div
              aria-hidden
              style={{
                width: 56,
                height: 56,
                margin: '0 auto',
                borderRadius: 16,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <h1 className="h1">موفق</h1>
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
