/**
 * Enterprise Phase 13 — coupons, referrals, loyalty API.
 */
const shared = require('@nazdik/shared');

const coupons = new Map(); // code -> Coupon
const usages = []; // CouponUsage
const referralCodes = new Map(); // code -> { userId, inviterPhoneHash, device }
const referralRewards = new Map(); // inviteeId -> { credited, inviterId }
const loyalty = new Map(); // `${vp}:${consumer}` -> LoyaltyCard

function lockKey(code, userId) {
  return `coupon:${code}:${userId}`;
}

function attachLoyaltyRoutes(ctx, match, json, readBody, authUser) {
  // seed demo coupons
  if (!coupons.has('WELCOME50')) {
    coupons.set('WELCOME50', {
      code: 'WELCOME50',
      type: 'flat',
      value: 50000,
      scope: 'first_order',
      maxRedemptions: 1000,
      maxPerUser: 1,
      usedCount: 0,
      active: true,
    });
  }
  if (!coupons.has('PERCENT20')) {
    coupons.set('PERCENT20', {
      code: 'PERCENT20',
      type: 'percent_capped',
      value: 20,
      capToman: 50000,
      scope: 'global',
      maxRedemptions: 500,
      maxPerUser: 2,
      usedCount: 0,
      active: true,
    });
  }
  if (!coupons.has('FREEDEL')) {
    coupons.set('FREEDEL', {
      code: 'FREEDEL',
      type: 'free_delivery',
      value: 0,
      scope: 'global',
      maxRedemptions: 100,
      maxPerUser: 1,
      usedCount: 0,
      active: true,
    });
  }

  match('GET', '/coupons/:code', (req, res, params) => {
    const c = coupons.get(shared.normalizeCouponCode(params.code));
    if (!c) return json(res, 404, { success: false, error: { code: 'COUPON_NOT_FOUND' } });
    return json(res, 200, { success: true, data: { ...c, usedCount: c.usedCount } });
  });

  match('POST', '/coupons/validate', async (req, res) => {
    const user = authUser(ctx, req);
    const body = await readBody(req);
    const code = shared.normalizeCouponCode(body.code);
    const coupon = coupons.get(code);
    const userId = user?.sub || body.userId || 'anon';
    const result = shared.evaluateCoupon({
      coupon,
      subtotalToman: Number(body.subtotalToman) || 0,
      userId,
      vendorProfileId: body.vendorProfileId,
      category: body.category,
      isFirstOrder: body.isFirstOrder,
      usages,
    });
    return json(res, 200, { success: true, data: result });
  });

  /**
   * Atomic redeem — concurrent single-use coupon: only one success.
   */
  match('POST', '/coupons/redeem', async (req, res) => {
    const user = authUser(ctx, req);
    const body = await readBody(req);
    const code = shared.normalizeCouponCode(body.code);
    const userId = user?.sub || body.userId;
    if (!userId) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });

    // in-process lock to simulate DB unique constraint under concurrency
    const lock = lockKey(code, userId);
    if (global.__nazdikCouponLocks == null) global.__nazdikCouponLocks = new Set();
    if (global.__nazdikCouponLocks.has(lock + ':global') && body.serial) {
      return json(res, 409, { success: false, error: { code: 'CONFLICT', message: 'در حال پردازش' } });
    }

    // serial execution: mark usedCount first (atomic in single-threaded node)
    const coupon = coupons.get(code);
    const evalRes = shared.evaluateCoupon({
      coupon,
      subtotalToman: Number(body.subtotalToman) || 0,
      userId,
      vendorProfileId: body.vendorProfileId,
      category: body.category,
      isFirstOrder: body.isFirstOrder,
      usages,
    });
    if (!evalRes.ok) {
      return json(res, 409, {
        success: false,
        error: { code: evalRes.error || 'COUPON_INVALID', message: 'کد قابل استفاده نیست' },
      });
    }
    // atomic increment
    if (coupon.usedCount >= coupon.maxRedemptions) {
      return json(res, 409, {
        success: false,
        error: { code: 'SOLD_OUT', message: 'کد به پایان رسیده است' },
      });
    }
    coupon.usedCount += 1;
    usages.push({ code, userId, orderId: body.orderId, at: Date.now() });

    return json(res, 200, {
      success: true,
      data: {
        code,
        discount: evalRes.discount,
        freeDelivery: evalRes.freeDelivery,
        usedCount: coupon.usedCount,
      },
    });
  });

  match('POST', '/referrals/code', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const code = shared.generateReferralCode(user.sub);
    referralCodes.set(code, {
      userId: user.sub,
      inviterPhoneHash: user.phone ? shared.phoneHash(user.phone) : undefined,
      device: undefined,
    });
    return json(res, 200, {
      success: true,
      data: { code, link: `/r/${code}`, rewardToman: 50000, inviteeDiscountToman: 30000 },
    });
  });

  match('POST', '/referrals/claim', async (req, res) => {
    const user = authUser(ctx, req);
    const body = await readBody(req);
    const code = String(body.code || '').toUpperCase();
    const inviter = referralCodes.get(code);
    if (!inviter) {
      return json(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'کد دعوت نامعتبر' } });
    }
    const inviteeId = user?.sub || body.inviteeId;
    if (
      shared.isSelfReferral({
        inviterId: inviter.userId,
        inviteeId,
        inviterPhoneHash: inviter.inviterPhoneHash,
        inviteePhoneHash: body.inviteePhone ? shared.phoneHash(body.inviteePhone) : undefined,
        inviterDevice: inviter.device,
        inviteeDevice: body.deviceFingerprint,
      })
    ) {
      return json(res, 400, {
        success: false,
        error: { code: 'SELF_REFERRAL', message: 'دعوت خودتان مجاز نیست' },
      });
    }
    if (referralRewards.has(inviteeId)) {
      return json(res, 409, { success: false, error: { code: 'ALREADY_CLAIMED' } });
    }
    referralRewards.set(inviteeId, { credited: false, inviterId: inviter.userId, code });
    return json(res, 200, {
      success: true,
      data: {
        inviteeId,
        inviterId: inviter.userId,
        inviteeWelcomeDiscountToman: 30000,
        inviterPendingRewardToman: 50000,
        note: 'پاداش دعوت‌کننده پس از اولین سفارش تکمیل‌شده مهمان واریز می‌شود',
      },
    });
  });

  match('POST', '/referrals/complete-invitee-order', async (req, res) => {
    const body = await readBody(req);
    const inviteeId = body.inviteeId;
    const rec = referralRewards.get(inviteeId);
    if (!rec) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    if (rec.credited) {
      return json(res, 200, { success: true, data: { alreadyCredited: true } });
    }
    rec.credited = true;
    // credit inviter wallet (memory)
    ctx.wallet.ensureWallet(rec.inviterId, 'USER');
    ctx.wallet.postEntry({
      ownerId: rec.inviterId,
      ownerType: 'USER',
      type: 'ADJUSTMENT',
      amountToman: 50000,
      idempotencyKey: `ref:${rec.code}:${inviteeId}`,
    });
    return json(res, 200, {
      success: true,
      data: { inviterId: rec.inviterId, creditedToman: 50000 },
    });
  });

  match('GET', '/loyalty/:vendorProfileId', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const key = `${params.vendorProfileId}:${user.sub}`;
    if (!global.__nazdikLoyalty) global.__nazdikLoyalty = new Map();
    const card =
      global.__nazdikLoyalty.get(key) ||
      ({
        vendorProfileId: params.vendorProfileId,
        consumerId: user.sub,
        stamps: 0,
        threshold: 5,
        rewardPercent: 50,
      });
    global.__nazdikLoyalty.set(key, card);
    return json(res, 200, { success: true, data: { card, progress: shared.loyaltyProgress(card) } });
  });

  match('POST', '/loyalty/:vendorProfileId/stamp', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const key = `${params.vendorProfileId}:${user.sub}`;
    if (!global.__nazdikLoyalty) global.__nazdikLoyalty = new Map();
    let card = global.__nazdikLoyalty.get(key) || {
      vendorProfileId: params.vendorProfileId,
      consumerId: user.sub,
      stamps: 0,
      threshold: 5,
      rewardPercent: 50,
    };
    card = shared.bumpLoyaltyStamp(card);
    global.__nazdikLoyalty.set(key, card);
    return json(res, 200, { success: true, data: { card, progress: shared.loyaltyProgress(card) } });
  });

  match('POST', '/loyalty/:vendorProfileId/apply', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const key = `${params.vendorProfileId}:${user.sub}`;
    if (!global.__nazdikLoyalty) global.__nazdikLoyalty = new Map();
    const card = global.__nazdikLoyalty.get(key);
    if (!card) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    const out = shared.applyLoyaltyDiscount(card, Number(body.subtotalToman) || 0);
    global.__nazdikLoyalty.set(key, out.card);
    return json(res, 200, { success: true, data: out });
  });
}

module.exports = { attachLoyaltyRoutes, coupons, usages, loyalty };
