'use client';

/**
 * Phase 8 — Admin console (demo login as ADMIN).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

export default function AdminPage() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [pending, setPending] = useState<string[]>(['vp_food_4', 'vp_field_1']);
  const [verified, setVerified] = useState<string[]>(['vp_food_1', 'vp_food_2', 'vp_beauty_1']);

  useEffect(() => {
    const u = localStorage.getItem(USER_KEY);
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        /* ignore */
      }
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(`${API}/api/v1/wallet/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((b) => {
          if (b.success) setBalance(b.data.balanceToman);
        })
        .catch(() => undefined);
    }
  }, []);

  async function loginAdmin() {
    setErr(null);
    try {
      const res = await fetch(`${API}/api/v1/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN', id: 'admin_demo' }),
      });
      const body = await res.json();
      if (!body.success) {
        setErr('ورود ادمین ناموفق');
        return;
      }
      localStorage.setItem(TOKEN_KEY, body.data.tokens.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(body.data.user));
      setUser(body.data.user);
      setMsg('ادمین وارد شد');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function verify(vp: string, approve: boolean) {
    setPending((p) => p.filter((x) => x !== vp));
    if (approve) setVerified((v) => [...v, vp]);
    setMsg(approve ? `${vp} تایید شد` : `${vp} رد شد`);
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">کنسول ادمین</h1>
          <p className="caption">فاز ۸ · تایید فروشنده، کیف پول پلتفرم</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {user?.role !== 'ADMIN' ? (
        <section className="card card-hero stack-3">
          <p className="body-muted">برای مشاهده کنسول، ورود دمو ادمین بزنید.</p>
          <button type="button" className="btn-primary" onClick={() => void loginAdmin()}>
            ورود ادمین دمو
          </button>
        </section>
      ) : (
        <>
          <section className="card stack-2">
            <h2 className="h2">کیف پول پلتفرم</h2>
            <div className="price">{balance != null ? `${balance.toLocaleString('fa-IR')} تومان` : '—'}</div>
            <p className="caption">کمیسیون پیش‌فرض ۱۰٪ از هر پرداخت موفق</p>
          </section>

          <section className="card stack-3">
            <h2 className="h2">فروشندگان در انتظار تایید</h2>
            {pending.length === 0 && <p className="body-muted">موردی نیست.</p>}
            {pending.map((vp) => (
              <div key={vp} className="list-card row-between">
                <span className="mono text-sm">{vp}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 40 }} onClick={() => verify(vp, true)}>
                    تایید
                  </button>
                  <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 40 }} onClick={() => verify(vp, false)}>
                    رد
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="card stack-2">
            <h2 className="h2">تاییدشده</h2>
            {verified.map((vp) => (
              <div key={vp} className="list-card">
                <span className="tag">{vp}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
