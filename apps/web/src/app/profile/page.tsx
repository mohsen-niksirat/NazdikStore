'use client';

/**
 * v1.6 — User profile + name edit.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Profile = {
  id: string;
  phone: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  isPhoneVerified?: boolean;
};

const ROLE_FA: Record<string, string> = {
  CONSUMER: 'مشتری',
  VENDOR: 'فروشنده',
  ADMIN: 'ادمین',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<Profile>('/users/me');
    if (!r.ok || !r.data) {
      setErr(r.error || 'بارگذاری پروفایل ناموفق — ابتدا وارد شوید');
      return;
    }
    setProfile(r.data);
    setFirstName(r.data.firstName || '');
    setLastName(r.data.lastName || '');
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setReady(true);
      setErr('ابتدا وارد شوید');
      return;
    }
    void load().finally(() => setReady(true));
  }, [load]);

  async function ensureDemoLogin() {
    const r = await apiFetch<{ user: Profile; tokens: { accessToken: string } }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo', phone: '09123456789' }),
    });
    if (!r.ok || !r.data) {
      setErr(r.error || 'ورود ناموفق');
      return;
    }
    localStorage.setItem(TOKEN_KEY, r.data.tokens.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
    setErr(null);
    void load();
  }

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await apiFetch<Profile>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ firstName, lastName }),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error || 'ذخیره ناموفق');
      return;
    }
    setProfile(r.data);
    try {
      const prev = localStorage.getItem(USER_KEY);
      const merged = { ...(prev ? JSON.parse(prev) : {}), ...r.data };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
    setMsg('پروفایل ذخیره شد');
  }

  if (!ready) {
    return (
      <main className="page page-center">
        <div className="card center body-muted">…</div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">پروفایل من</h1>
          <p className="caption">v1.6 · ویرایش نام</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {!profile ? (
        <section className="card card-hero stack-3">
          <p className="body-muted">برای مشاهده پروفایل وارد شوید.</p>
          <button type="button" className="btn-primary" onClick={() => void ensureDemoLogin()}>
            ورود دمو مشتری
          </button>
          <Link href="/auth" className="btn-secondary">
            ورود با پیامک
          </Link>
        </section>
      ) : (
        <>
          <section className="card card-hero stack-3">
            <div>
              <div className="h2">
                {profile.firstName || profile.lastName
                  ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                  : 'بدون نام'}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="tag">{ROLE_FA[profile.role] || profile.role}</span>
                <span className="tag tag-line mono" dir="ltr">
                  {profile.phone}
                </span>
                {profile.isPhoneVerified && <span className="tag tag-gold">شماره تایید شده</span>}
              </div>
            </div>
          </section>

          <section className="card stack-3">
            <h2 className="h2">ویرایش نام</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="field">
                <label htmlFor="fn">نام</label>
                <input
                  id="fn"
                  className="input-field"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="ln">نام خانوادگی</label>
                <input
                  id="ln"
                  className="input-field"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
              ذخیره تغییرات
            </button>
          </section>

          <section className="stack-2">
            <Link href="/orders" className="btn-secondary">
              سفارش‌های من
            </Link>
            <Link href="/messages" className="btn-secondary">
              پیام‌ها
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
