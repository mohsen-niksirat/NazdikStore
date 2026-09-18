'use client';

/**
 * Phase 9 — Order chat + notification center.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, MessageCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Msg = {
  id: string;
  from: string;
  role: string;
  body: string;
  createdAt: string;
};

type Notice = {
  id: string;
  topic: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

function token() {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

async function api(path: string, init?: RequestInit) {
  const t = token();
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.success !== false, body };
}

const TOPIC_FA: Record<string, string> = {
  'chat.message': 'پیام جدید چت',
  'payment.paid': 'پرداخت موفق',
  'order.paid': 'سفارش پرداخت شد',
  'payment.refunded': 'بازگشت وجه',
};

export default function MessagesPage() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [tab, setTab] = useState<'chat' | 'alerts'>('chat');
  const [orderId, setOrderId] = useState('demo_order');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const u = localStorage.getItem(USER_KEY);
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        /* ignore */
      }
    }
    void loadChat();
    void loadNotices();
    const t = setInterval(() => {
      void loadChat();
      void loadNotices();
    }, 4000);
    return () => clearInterval(t);
  }, [orderId]);

  const loadChat = useCallback(async () => {
    const r = await api(`/orders/${orderId}/messages`);
    if (r.ok) setMessages(r.body.data || []);
  }, [orderId]);

  const loadNotices = useCallback(async () => {
    const r = await api('/notifications');
    if (r.ok) setNotices(r.body.data || []);
  }, []);

  async function ensureLogin(role: 'CONSUMER' | 'VENDOR') {
    const id = role === 'VENDOR' ? 'vendor_demo' : 'consumer_demo';
    const r = await api('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ role, id }),
    });
    if (!r.ok) {
      setErr('ورود ناموفق');
      return;
    }
    localStorage.setItem(TOKEN_KEY, r.body.data.tokens.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(r.body.data.user));
    setUser(r.body.data.user);
    setMsg(`ورود ${role}`);
  }

  async function send() {
    if (!text.trim()) return;
    setErr(null);
    const r = await api(`/orders/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: text }),
    });
    if (!r.ok) {
      setErr(r.body.error?.message || 'ارسال ناموفق — ابتدا وارد شوید');
      return;
    }
    setText('');
    await loadChat();
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">پیام‌ها</h1>
          <p className="caption">فاز ۹ · چت سفارش + اعلان‌ها</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {!user ? (
        <section className="card stack-3">
          <h2 className="h2">ورود سریع</h2>
          <div className="btn-row">
            <button type="button" className="btn-primary" onClick={() => void ensureLogin('CONSUMER')}>
              مشتری دمو
            </button>
            <button type="button" className="btn-secondary" onClick={() => void ensureLogin('VENDOR')}>
              فروشنده دمو
            </button>
          </div>
        </section>
      ) : (
        <div className="caption">کاربر: {user.id} ({user.role})</div>
      )}

      <div className="tabs" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" className={`tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>
          <MessageCircle style={{ width: 14, height: 14, verticalAlign: 'middle' }} aria-hidden /> چت
        </button>
        <button type="button" className={`tab${tab === 'alerts' ? ' active' : ''}`} onClick={() => setTab('alerts')}>
          <Bell style={{ width: 14, height: 14, verticalAlign: 'middle' }} aria-hidden /> اعلان‌ها ({notices.length})
        </button>
      </div>

      {tab === 'chat' ? (
        <section className="card stack-3">
          <div className="field">
            <label>شناسه سفارش / گفتگو</label>
            <input className="input-field mono" dir="ltr" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </div>
          <div className="stack-2" style={{ minHeight: 160, maxHeight: 280, overflow: 'auto' }}>
            {messages.length === 0 && <p className="body-muted">پیامی نیست.</p>}
            {messages.map((m) => {
              const mine = user && (m.from === user.id || m.from === `vp_${user.id}`);
              return (
                <div
                  key={m.id}
                  className="list-card"
                  style={{
                    marginInlineStart: mine ? 'auto' : 0,
                    marginInlineEnd: mine ? 0 : 'auto',
                    maxWidth: '85%',
                    background: mine ? 'var(--accent-soft)' : 'var(--white)',
                    borderColor: mine ? 'rgba(15,107,92,.25)' : 'var(--line)',
                  }}
                >
                  <div className="caption">{m.role} · {m.from}</div>
                  <div className="text-sm mt-1">{m.body}</div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              className="input-field"
              placeholder="پیام بنویسید…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
            />
            <button type="button" className="btn-primary" style={{ width: 'auto', minWidth: 88 }} onClick={() => void send()}>
              ارسال
            </button>
          </div>
        </section>
      ) : (
        <section className="stack-3">
          {notices.length === 0 && <div className="card body-muted">اعلانی نیست.</div>}
          {notices.map((n) => (
            <div key={n.id} className="list-card">
              <div className="row-between">
                <strong className="text-sm">{TOPIC_FA[n.topic] || n.topic}</strong>
                <span className="caption">{new Date(n.createdAt).toLocaleTimeString('fa-IR')}</span>
              </div>
              {n.payload && (
                <div className="caption mt-1 mono" dir="ltr">
                  {JSON.stringify(n.payload)}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <Link href="/cart" className="btn-secondary">
        سبد خرید
      </Link>
    </main>
  );
}
