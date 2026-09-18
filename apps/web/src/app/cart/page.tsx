'use client';

/**
 * Phase 7 — Consumer commerce: catalogue, cart, checkout, payment demo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';
const CART_KEY = 'nazdik_cart';

type CartLine = {
  productId: string;
  title: string;
  unitPriceToman: number;
  quantity: number;
  vendorProfileId: string;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  priceToman: number;
  stock: number | null;
};

type VendorProfile = {
  id: string;
  businessName: string;
  products: Product[];
};

function fmt(n: number) {
  return n.toLocaleString('fa-IR');
}

export default function CartPage() {
  const [profiles, setProfiles] = useState<VendorProfile[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('تهران');
  const [lastOrder, setLastOrder] = useState<{ id: string; totalToman: number } | null>(null);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [freeDelivery, setFreeDelivery] = useState(false);

  const applyCoupon = useCallback(async () => {
    setCouponMsg(null);
    const subtotal = cart.reduce((s, l) => s + l.unitPriceToman * l.quantity, 0);
    const r = await apiFetch<{ ok: boolean; discount: number; freeDelivery: boolean; error?: string }>(
      '/coupons/validate',
      {
        method: 'POST',
        body: JSON.stringify({ code: coupon, subtotalToman: subtotal }),
      },
    );
    if (!r.ok || !r.data?.ok) {
      setDiscount(0);
      setFreeDelivery(false);
      setCouponMsg(r.data?.error || r.error || 'کد نامعتبر است');
      return;
    }
    setDiscount(r.data.discount);
    setFreeDelivery(Boolean(r.data.freeDelivery));
    setCouponMsg(
      r.data.freeDelivery
        ? 'ارزانی حمل اعمال شد'
        : `تخفیف ${r.data.discount.toLocaleString('fa-IR')} تومان اعمال شد`,
    );
  }, [coupon, cart]);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        /* ignore */
      }
    }
    const c = localStorage.getItem(CART_KEY);
    if (c) {
      try {
        setCart(JSON.parse(c));
      } catch {
        /* ignore */
      }
    }
    void (async () => {
      try {
        const list = await fetch(`${API}/api/v1/feed`).then((r) => r.json());
        const ids = new Set<string>(
          (list.data || []).map((p: { vendorProfileId: string }) => p.vendorProfileId),
        );
        ids.add('vp_food_1');
        const out: VendorProfile[] = [];
        for (const id of Array.from(ids).slice(0, 6)) {
          const r = await fetch(`${API}/api/v1/vendors/${id}/profile`);
          const b = await r.json();
          if (b.success && b.data?.products?.length) out.push(b.data);
        }
        setProfiles(out);
      } catch {
        setErr('API روی پورت ۴۰۰۰ در دسترس نیست');
      }
    })();
  }, []);

  const persist = (next: CartLine[]) => {
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  };

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.unitPriceToman * l.quantity, 0),
    [cart],
  );

  const addToCart = (vp: VendorProfile, p: Product) => {
    const next = [...cart];
    const idx = next.findIndex((l) => l.productId === p.id);
    if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
    else
      next.push({
        productId: p.id,
        title: p.title,
        unitPriceToman: p.priceToman,
        quantity: 1,
        vendorProfileId: vp.id,
      });
    persist(next);
    setMsg(`«${p.title}» به سبد اضافه شد`);
  };

  const setQty = (productId: string, q: number) => {
    if (q <= 0) persist(cart.filter((l) => l.productId !== productId));
    else persist(cart.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)));
  };

  async function ensureConsumer() {
    let token = localStorage.getItem(TOKEN_KEY);
    let u = user;
    if (!token || u?.role === 'VENDOR') {
      const res = await fetch(`${API}/api/v1/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo', phone: '09123456789' }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error?.message || 'login failed');
      token = body.data.tokens.accessToken;
      u = body.data.user;
      localStorage.setItem(TOKEN_KEY, token!);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
    }
    return token!;
  }

  const checkout = useCallback(async () => {
    if (!cart.length) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const token = await ensureConsumer();
      const byVendor = new Map<string, CartLine[]>();
      for (const line of cart) {
        const arr = byVendor.get(line.vendorProfileId) || [];
        arr.push(line);
        byVendor.set(line.vendorProfileId, arr);
      }
      let last: { id: string; totalToman: number } | null = null;
      for (const [vp, lines] of byVendor) {
        const res = await fetch(`${API}/api/v1/orders/delivery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            vendorProfileId: vp,
            deliveryAddress: address,
            lines: lines.map((l) => ({
              productId: l.productId,
              title: l.title,
              unitPriceToman: l.unitPriceToman,
              quantity: l.quantity,
            })),
          }),
        });
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error?.message || 'order failed');
        last = body.data;
      }
      // Atomic coupon redeem at checkout (single-use)
      if (coupon.trim() && last) {
        const r = await apiFetch<{ discount: number; freeDelivery?: boolean }>(
          '/coupons/redeem',
          {
            method: 'POST',
            body: JSON.stringify({
              code: coupon,
              subtotalToman: last.totalToman,
              orderId: last.id,
            }),
          },
        );
        if (r.ok && r.data) {
          setDiscount(r.data.discount || 0);
          setCouponMsg(`کد ${coupon.toUpperCase()} روی سفارش اعمال شد`);
        } else {
          setCouponMsg(r.error || r.data?.error || 'کد تخفیف اعمال نشد');
        }
      }
      setLastOrder(last);
      setMsg(`سفارش ثبت شد — ${fmt(last!.totalToman)} تومان`);
      persist([]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [cart, address, coupon]);

  const payNow = useCallback(async () => {
    if (!lastOrder) return;
    setBusy(true);
    setErr(null);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${API}/api/v1/orders/${lastOrder.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': `pay_${lastOrder.id}_1`,
        },
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error?.message || 'pay failed');
      const paymentId = body.data.id;
      setLastPayment(paymentId);
      const sim = await fetch(`${API}/api/v1/payments/simulate/${paymentId}`, { method: 'POST' });
      const simBody = await sim.json();
      if (simBody.success) {
        setMsg(
          `پرداخت موفق (شبیه‌سازی بانک)\nکمیسیون پلتفرم: ${fmt(simBody.data.commissionToman)} · سهم فروشنده: ${fmt(simBody.data.vendorCredit)}`,
        );
      } else {
        setMsg('پرداخت ایجاد شد — وب‌هوک بانک را اجرا کنید');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [lastOrder]);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">سبد خرید</h1>
          <p className="caption">فاز ۷ · کاتالوگ، سفارش و پرداخت</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok" style={{ whiteSpace: 'pre-wrap' }}>{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <section className="card stack-3">
        <h2 className="h2">کاتالوگ محلی</h2>
        {profiles.length === 0 && <p className="body-muted">در حال بارگذاری محصولات…</p>}
        {profiles.map((vp) => (
          <div key={vp.id} className="stack-2">
            <div className="text-sm font-bold">{vp.businessName}</div>
            {vp.products.map((p) => (
              <div key={p.id} className="list-card row-between" style={{ marginTop: 0 }}>
                <div>
                  <strong>{p.title}</strong>
                  <div className="caption">{p.description || ''}</div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="price">{fmt(p.priceToman)}</span>
                  <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 36, padding: '0 12px' }} onClick={() => addToCart(vp, p)}>
                    افزودن
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="card stack-3">
        <h2 className="h2">سبد ({cart.reduce((s, l) => s + l.quantity, 0)} قلم)</h2>
        {cart.length === 0 && <p className="body-muted">سبد خالی است.</p>}
        {cart.map((l) => (
          <div key={l.productId} className="row-between">
            <div>
              <strong className="text-sm">{l.title}</strong>
              <div className="caption">{fmt(l.unitPriceToman)} × {l.quantity}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="pill" onClick={() => setQty(l.productId, l.quantity + 1)}>
                +
              </button>
              <button type="button" className="pill" onClick={() => setQty(l.productId, l.quantity - 1)}>
                −
              </button>
            </div>
          </div>
        ))}
        {cart.length > 0 && (
          <>
            <div className="field">
              <label>کد تخفیف</label>
              <div className="flex gap-2">
                <input
                  className="input-field"
                  dir="ltr"
                  placeholder="PERCENT20"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto', minWidth: 72 }}
                  onClick={() => void applyCoupon()}
                >
                  اعمال
                </button>
              </div>
            </div>
            {couponMsg && (
              <div className={discount > 0 || freeDelivery ? 'alert alert-ok' : 'alert alert-error'}>
                {couponMsg}
              </div>
            )}
            <div className="row-between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <span>جمع کل</span>
              <span className="price">{fmt(total)} تومان</span>
            </div>
            {discount > 0 && (
              <div className="row-between text-sm">
                <span className="text-accent">تخفیف</span>
                <span className="text-accent">−{fmt(discount)}</span>
              </div>
            )}
            <div className="row-between">
              <span>قابل پرداخت</span>
              <span className="price">{fmt(Math.max(0, total - discount))} تومان</span>
            </div>
            <div className="field">
              <label>آدرس تحویل</label>
              <input className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void checkout()}>
              {busy ? <Loader2 style={{ width: 16, height: 16 }} aria-hidden /> : null}
              ثبت سفارش
            </button>
          </>
        )}
        {lastOrder && (
          <div className="alert alert-muted stack-2">
            <div className="text-sm">
              سفارش <span className="mono">{lastOrder.id.slice(0, 12)}…</span> · {fmt(lastOrder.totalToman)} تومان
            </div>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void payNow()}>
              پرداخت (بانک نمونه)
            </button>
          </div>
        )}
      </section>

      <section className="card stack-2">
        <h2 className="h2">سفارش‌های من</h2>
        <MyOrders tokenReady={Boolean(user)} />
      </section>

      <Link href="/vendor" className="btn-secondary">
        پنل فروشنده
      </Link>
    </main>
  );
}

function MyOrders({ tokenReady }: { tokenReady: boolean }) {
  const [orders, setOrders] = useState<Array<{ id: string; status: string; totalToman: number }>>([]);
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch(`${API}/api/v1/orders/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => {
        if (b.success) setOrders(b.data || []);
      })
      .catch(() => undefined);
  }, [tokenReady]);
  if (!orders.length) return <p className="caption">هنوز سفارشی ثبت نشده است.</p>;
  return (
    <>
      {orders.map((o) => (
        <div key={o.id} className="list-card row-between">
          <span className="mono text-xs">{o.id.slice(0, 12)}…</span>
          <span className="tag">{o.status}</span>
          <span className="price">{fmt(o.totalToman)}</span>
        </div>
      ))}
    </>
  );
}
