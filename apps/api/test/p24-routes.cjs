/**
 * P24 — Growth: referral campaign summary + trending coupons banner data.
 */
function attachP24Routes(ctx, match, json, readBody, authUser) {
  match('GET', '/growth/home-banner', (req, res) => {
    return json(res, 200, {
      success: true,
      data: {
        headline: 'کد PERCENT20 را روی اولین سفارش امتحان کن',
        sub: 'تا ۵۰ هزار تومان تخفیف · همچنین دعوت دوستان جایزه دارد',
        cta: { label: 'ثبت‌نام / ورود', href: '/auth' },
        secondary: { label: 'تنظیمات دعوت', href: '/settings' },
        coupons: [
          { code: 'PERCENT20', fa: '۲۰٪ تا ۵۰ هزار' },
          { code: 'WELCOME50', fa: '۵۰ هزار خوش‌آمد (اولین سفارش)' },
          { code: 'FREEDEL', fa: 'ارزانی حمل' },
        ],
      },
    });
  });

  match('GET', '/growth/referral-me', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const shared = require('@nazdik/shared');
    const code = shared.generateReferralCode(user.sub);
    return json(res, 200, {
      success: true,
      data: {
        code,
        link: `/r/${code}`,
        rewardToman: 50000,
        inviteeDiscountToman: 30000,
        note: 'پس از اولین سفارش تکمیل‌شده مهمان، پاداش به کیف پول شما می‌نشیند.',
      },
    });
  });
}

module.exports = { attachP24Routes };
