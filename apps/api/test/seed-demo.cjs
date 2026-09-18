/**
 * Seed richer demo data into the mini API memory engines.
 * Run at mini-server boot when SEED_MAP=1 (default).
 */
function seedDemoExtras(ctx) {
  const { feed, slots, orders, reviews, map } = ctx;

  // Extra vendor profile for appointments
  feed.seedProfile({
    id: 'vp_clinic_demo',
    businessName: 'مطب دکتر رضایی',
    vendorType: 'MEDICAL',
    categoryTags: ['general', 'visit'],
    description: 'ویزیت عمومی با نوبت‌دهی آنلاین',
    verificationStatus: 'VERIFIED',
    isHomeBased: false,
    address: 'میدان ونک',
    displayLat: 35.705,
    displayLng: 51.41,
  });

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  slots.setSchedule('vp_clinic_demo', [
    { weekday: new Date().getDay(), startMinute: 9 * 60, endMinute: 13 * 60, slotMinutes: 30, breaks: [{ start: 12 * 60, end: 12 * 60 + 30 }] },
  ]);
  slots.ensureDaySlots('vp_clinic_demo', today);
  slots.ensureDaySlots('vp_clinic_demo', tomorrow);

  feed.createPost({
    vendorProfileId: 'vp_clinic_demo',
    caption: 'نوبت‌های این هفته باز شد — رزرو از بخش نوبت‌دهی.',
  });

  // Field service for RFQ demo
  feed.seedProfile({
    id: 'vp_field_1',
    businessName: 'تعمیرکار موبایل علی',
    vendorType: 'FIELD_SERVICE',
    categoryTags: ['mobile', 'repair'],
    description: 'سرویس در محل',
    verificationStatus: 'VERIFIED',
    isHomeBased: true,
    address: 'محدوده شرق تهران',
    displayLat: 35.67,
    displayLng: 51.42,
  });

  map.upsertMemory({
    id: 'loc_clinic',
    vendorProfileId: 'vp_clinic_demo',
    businessName: 'مطب دکتر رضایی',
    vendorType: 'MEDICAL',
    categoryTags: ['general'],
    description: 'ویزیت عمومی',
    verificationStatus: 'VERIFIED',
    isHomeBased: false,
    lat: 35.705,
    lng: 51.41,
    address: 'میدان ونک',
    serviceRadiusKm: 10,
  });

  // Open RFQ sample
  try {
    const { job } = ctx.rfq.createJobRequest({
      consumerId: 'consumer_demo',
      title: 'تعمیر پکیج',
      description: 'پکیج روشن نمی‌شود — نیاز به سرویس در محل',
      lat: 35.6892,
      lng: 51.389,
      radiusKm: 8,
    });
    ctx.rfq.submitQuote({
      jobRequestId: job.id,
      vendorProfileId: 'vp_field_1',
      priceToman: 850000,
      etaHours: 3,
      message: 'امروز عصر می‌رسم',
    });
  } catch {
    /* ignore */
  }

  // Product catalogue on food vendor
  try {
    feed.getVendorProfile('vp_food_1');
  } catch {
    feed.seedProfile({
      id: 'vp_food_1',
      businessName: 'آشپزخانه مادر',
      vendorType: 'FOOD',
      description: 'غذای خانگی',
      verificationStatus: 'VERIFIED',
      isHomeBased: true,
    });
  }
  feed.createProduct({
    vendorProfileId: 'vp_food_1',
    title: 'قورمه سبزی خانگی',
    description: 'پرسی با برنج ایرانی',
    priceToman: 185000,
    stock: 25,
  });
  feed.createProduct({
    vendorProfileId: 'vp_food_1',
    title: 'زرشک پلو با مرغ',
    description: 'پرسی',
    priceToman: 220000,
    stock: 15,
  });

  return { today, tomorrow };
}

module.exports = { seedDemoExtras };
