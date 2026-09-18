/**
 * Enterprise Phase 13 — Coupons, referral, loyalty punch-cards.
 */

export type CouponType = 'flat' | 'percent_capped' | 'free_delivery';

export interface Coupon {
  code: string;
  type: CouponType;
  /** flat toman off OR percent 0-100 */
  value: number;
  /** cap for percent type (toman) */
  capToman?: number;
  scope: 'global' | 'vendor' | 'category' | 'first_order';
  vendorProfileId?: string;
  category?: string;
  maxRedemptions: number;
  maxPerUser: number;
  usedCount: number;
  active: boolean;
}

export interface CouponUsage {
  code: string;
  userId: string;
  orderId?: string;
  at: number;
}

export function normalizeCouponCode(code: string): string {
  return String(code || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]/g, '');
}

export function couponDiscountToman(
  coupon: Coupon,
  subtotalToman: number,
): { discount: number; freeDelivery: boolean; reason?: string } {
  if (!coupon.active) return { discount: 0, freeDelivery: false, reason: 'INACTIVE' };
  if (subtotalToman <= 0) return { discount: 0, freeDelivery: false, reason: 'EMPTY_CART' };

  if (coupon.type === 'free_delivery') {
    return { discount: 0, freeDelivery: true };
  }
  if (coupon.type === 'flat') {
    return { discount: Math.min(coupon.value, subtotalToman), freeDelivery: false };
  }
  // percent_capped
  const raw = Math.round((subtotalToman * coupon.value) / 100);
  const cap = coupon.capToman ?? raw;
  return { discount: Math.min(raw, cap, subtotalToman), freeDelivery: false };
}

export function evaluateCoupon(opts: {
  coupon?: Coupon | null;
  subtotalToman: number;
  userId: string;
  vendorProfileId?: string;
  category?: string;
  isFirstOrder?: boolean;
  usages: CouponUsage[];
}): { ok: boolean; discount: number; freeDelivery: boolean; code?: string; error?: string } {
  const { coupon } = opts;
  if (!coupon) return { ok: false, discount: 0, freeDelivery: false, error: 'COUPON_NOT_FOUND' };
  const code = normalizeCouponCode(coupon.code);
  if (!coupon.active) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: 'INACTIVE' };
  }
  if (coupon.usedCount >= coupon.maxRedemptions) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: 'SOLD_OUT' };
  }
  const mine = opts.usages.filter((u) => u.code === code && u.userId === opts.userId);
  if (mine.length >= coupon.maxPerUser) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: 'USER_LIMIT' };
  }
  if (coupon.scope === 'first_order' && opts.isFirstOrder === false) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: 'NOT_FIRST_ORDER' };
  }
  if (coupon.scope === 'vendor' && coupon.vendorProfileId && opts.vendorProfileId !== coupon.vendorProfileId) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: 'VENDOR_SCOPE' };
  }
  if (coupon.scope === 'category' && coupon.category && opts.category !== coupon.category) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: 'CATEGORY_SCOPE' };
  }
  const d = couponDiscountToman(coupon, opts.subtotalToman);
  if (d.reason) {
    return { ok: false, discount: 0, freeDelivery: false, code, error: d.reason };
  }
  return { ok: true, discount: d.discount, freeDelivery: d.freeDelivery, code };
}

export function generateReferralCode(userId: string): string {
  const raw = String(userId || 'user');
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `NZ${h.toString(36).toUpperCase().slice(0, 6)}`;
}

export function phoneHash(phone: string): string {
  const n = String(phone || '').replace(/\D/g, '');
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (Math.imul(31, h) + n.charCodeAt(i)) | 0;
  return `ph_${(h >>> 0).toString(36)}`;
}

export function isSelfReferral(opts: {
  inviterId: string;
  inviteeId: string;
  inviterPhoneHash?: string;
  inviteePhoneHash?: string;
  inviterDevice?: string;
  inviteeDevice?: string;
}): boolean {
  if (opts.inviterId && opts.inviteeId && opts.inviterId === opts.inviteeId) return true;
  if (opts.inviterPhoneHash && opts.inviterPhoneHash === opts.inviteePhoneHash) return true;
  if (opts.inviterDevice && opts.inviterDevice === opts.inviteeDevice) return true;
  return false;
}

export interface LoyaltyCard {
  vendorProfileId: string;
  consumerId: string;
  /** completed paid orders count toward the stamp */
  stamps: number;
  /** orders needed before reward */
  threshold: number;
  rewardPercent: number; // e.g. 50 → 50% off
}

export function loyaltyProgress(card: LoyaltyCard): {
  stamps: number;
  threshold: number;
  rewardReady: boolean;
  remaining: number;
} {
  return {
    stamps: card.stamps,
    threshold: card.threshold,
    rewardReady: card.stamps >= card.threshold,
    remaining: Math.max(0, card.threshold - card.stamps),
  };
}

export function applyLoyaltyDiscount(
  card: LoyaltyCard,
  subtotalToman: number,
): { discount: number; card: LoyaltyCard; rewarded: boolean } {
  if (card.stamps < card.threshold) return { discount: 0, card, rewarded: false };
  const discount = Math.round((subtotalToman * card.rewardPercent) / 100);
  return {
    discount,
    card: { ...card, stamps: 0 },
    rewarded: true,
  };
}

export function bumpLoyaltyStamp(card: LoyaltyCard): LoyaltyCard {
  return { ...card, stamps: card.stamps + 1 };
}

export const PRODUCTION_LOYALTY_PHASE = 13;
