const fs = require('fs');
const path = require('path');

// Fix mini-server CORS + env
const ms = path.join('C:/Users/MOHSEN/Desktop/Github Projects/NazdikStore/apps/api/test/mini-server.cjs');
let t = fs.readFileSync(ms, 'utf8');
t = t.replace(
  "process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://127.0.0.1:3000,http://127.0.0.1:3300,http://127.0.0.1:5000';",
  "process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3300,http://127.0.0.1:3300,http://localhost:5000,http://127.0.0.1:5000,http://localhost:4200,http://127.0.0.1:4200';",
);
t = t.replace(
  `'Access-Control-Allow-Origin': process.env.CORS_ORIGINS || 'http://localhost:3000',`,
  `'Access-Control-Allow-Origin': '*',`,
);
t = t.replace(
  `'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',`,
  `'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',\n    'Access-Control-Allow-Credentials': 'true',`,
);
fs.writeFileSync(ms, t);
console.log('mini-server CORS fixed');

// Fix auth page callbacks to use apiFetch
const auth = path.join('C:/Users/MOHSEN/Desktop/Github Projects/NazdikStore/apps/web/src/app/auth/page.tsx');
let a = fs.readFileSync(auth, 'utf8');

const requestNew = `  const requestOtp = useCallback(async (rawPhone: string) => {
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
  }, []);`;

const verifyNew = `  const verifyOtp = useCallback(async () => {
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
  }, [otpValue, phone]);`;

const completeNew = `  const completeProfile = useCallback(async () => {
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
  }, [accessToken, role, businessName, vendorType, firstName, lastName]);`;

function replaceFn(src, name, next) {
  const re = new RegExp(`  const ${name} = useCallback\\([\\s\\S]*?\\n  \\}, \\[[^\\]]*\\]\\);`);
  if (!re.test(src)) {
    console.log('WARN fn not found', name);
    return src;
  }
  return src.replace(re, next);
}

a = replaceFn(a, 'requestOtp', requestNew);
a = replaceFn(a, 'verifyOtp', verifyNew);
a = replaceFn(a, 'completeProfile', completeNew);

// remove unused API_URL if still present
a = a.replace(/const API_URL = [^;]+;\n/g, '');

fs.writeFileSync(auth, a);
console.log('auth page apiFetch wired');
