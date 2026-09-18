'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  applyTheme,
  loadTheme,
  loadDataSaver,
  setDataSaver,
  type ThemeMode,
} from '@nazdik/shared';

export default function SettingsPage() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [saver, setSaver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [referral, setReferral] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<{ stamps: number; threshold: number; rewardReady: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setTheme(loadTheme());
    setSaver(loadDataSaver());
    applyTheme(loadTheme());
  }, []);

  const pickTheme = (m: ThemeMode) => {
    setTheme(m);
    applyTheme(m);
    setMsg(`پوسته: ${m === 'light' ? 'روشن' : m === 'oled' ? 'مشکی OLED' : 'کنتراست بالا'}`);
  };

  const toggleSaver = () => {
    const next = !saver;
    setSaver(next);
    setDataSaver(next);
    setMsg(next ? 'حالت صرفه‌جویی اینترنت فعال شد' : 'حالت صرفه‌جویی خاموش شد');
  };

  const getReferral = useCallback(async () => {
    setErr(null);
    const login = await apiFetch<{ tokens: { accessToken: string }; user: unknown }>(
      '/auth/dev-login',
      { method: 'POST', body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }) },
    );
    if (login.ok && login.data) {
      localStorage.setItem('nazdik_token', login.data.tokens.accessToken);
      localStorage.setItem('nazdik_user', JSON.stringify(login.data.user));
    }
    const r = await apiFetch<{ code: string; link: string }>('/referrals/code', { method: 'POST' });
    if (!r.ok || !r.data) {
      setErr(r.error || 'کد دعوت در دسترس نیست');
      return;
    }
    setReferral(r.data.code);
  }, []);

  const loadLoyalty = useCallback(async () => {
    const r = await apiFetch<{ progress: { stamps: number; threshold: number; rewardReady: boolean } }>(
      '/loyalty/vp_food_1',
    );
    if (r.ok && r.data) setLoyalty(r.data.progress);
  }, []);

  useEffect(() => {
    void loadLoyalty();
  }, [loadLoyalty]);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">تنظیمات</h1>
          <p className="caption">فاز ۱۷ · پوسته و صرفه‌جویی</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <section className="card stack-3">
        <h2 className="h2">پوسته</h2>
        <div className="radius-row">
          {(
            [
              ['light', 'روشن'],
              ['oled', 'مشکی OLED'],
              ['high-contrast', 'کنتراست بالا'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`pill${theme === k ? ' active' : ''}`}
              onClick={() => pickTheme(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saver} onChange={toggleSaver} style={{ width: 18, height: 18 }} />
          حالت صرفه‌جویی در مصرف اینترنت
        </label>
      </section>

      <section className="card stack-3">
        <h2 className="h2">کد دعوت</h2>
        <button type="button" className="btn-secondary" onClick={() => void getReferral()}>
          دریافت کد دعوت
        </button>
        {referral && (
          <div className="alert alert-ok">
            کد شما: <span className="mono">{referral}</span>
          </div>
        )}
      </section>

      <section className="card stack-3">
        <h2 className="h2">کارت وفاداری (آشپزخانه مادر)</h2>
        {loyalty ? (
          <>
            <div className="text-sm">
              مهرها: <strong>{loyalty.stamps}</strong> از {loyalty.threshold}
            </div>
            {loyalty.rewardReady ? (
              <div className="alert alert-ok">پاداش ۵۰٪ آماده است!</div>
            ) : (
              <div className="caption">تا پاداش {loyalty.threshold - loyalty.stamps} خرید دیگر</div>
            )}
          </>
        ) : (
          <p className="caption">در دسترس نیست — API بالا باشد</p>
        )}
        <Link href="/cart" className="btn-secondary">
          سبد خرید / کد تخفیف
        </Link>
        <Link href="/track" className="btn-secondary">
          رهگیری پیک
        </Link>
        <Link href="/assistant" className="btn-secondary">
          دستیار هوشمند
        </Link>
      </section>
    </main>
  );
}
