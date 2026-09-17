import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MapService } from '../map/map.service';
import { FeedService } from '../feed/feed.service';
import { ReviewsService } from '../reviews/reviews.service';

/**
 * Seeds map + feed demo data on boot for local UX without PostGIS.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly map: MapService,
    private readonly feed: FeedService,
    private readonly reviews: ReviewsService,
  ) {}

  onModuleInit() {
    this.map.seedMemory(demoVendors());
    this.seedFeed();
    this.seedReviews();
    this.logger.log(
      `Seeded map=${this.map.getMemoryCount()} feed vendors + demo posts/reviews`,
    );
  }

  private seedFeed() {
    for (const v of demoVendors()) {
      this.feed.seedProfile({
        id: v.vendorProfileId,
        businessName: v.businessName,
        vendorType: v.vendorType,
        categoryTags: v.categoryTags,
        description: v.description,
        verificationStatus: v.verificationStatus,
        isHomeBased: v.isHomeBased,
        address: v.address,
        displayLat: v.lat,
        displayLng: v.lng,
        socialLinks: {},
      });
    }

    this.feed.createPost({
      vendorProfileId: 'vp_food_1',
      caption: 'قورمه سبزی امروز — برای ۲۰ نفر آماده می‌شود. سفارش تا ساعت ۱۶.',
      imageUrls: ['/media/demo/ghorme.svg'],
      productTags: [{ productId: 'prod_ghorme', title: 'قورمه سبزی', priceToman: 185000 }],
    });
    this.feed.createProduct({
      vendorProfileId: 'vp_food_1',
      title: 'قورمه سبزی خانگی',
      description: 'پرسی — با برنج ایرانی',
      priceToman: 185000,
      stock: 20,
    });
    this.feed.createPost({
      vendorProfileId: 'vp_food_2',
      caption: 'نان سنگک تازه از تنور — هر روز صبح ۶ تا ۱۲.',
      imageUrls: [],
    });
    this.feed.createProduct({
      vendorProfileId: 'vp_food_2',
      title: 'نان سنگک',
      description: 'تازه',
      priceToman: 25000,
      stock: null,
    });
    this.feed.createPost({
      vendorProfileId: 'vp_beauty_1',
      caption: 'نوبت‌های این هفته باز شد. رزرو از طریق پیام.',
      imageUrls: [],
    });
  }

  private seedReviews() {
    // Demo completed engagements unlock reviews
    this.reviews.grantEngagement('vp_food_1', 'consumer_demo_1');
    this.reviews.grantEngagement('vp_food_1', 'consumer_demo_2');
    this.reviews.grantEngagement('vp_food_2', 'consumer_demo_1');

    void this.reviews.createReview({
      vendorProfileId: 'vp_food_1',
      consumerId: 'consumer_demo_1',
      rating: 5,
      body: 'خیلی خوشمزه و به‌موقع. حتماً دوباره سفارش می‌دهم.',
    });
    void this.reviews.createReview({
      vendorProfileId: 'vp_food_1',
      consumerId: 'consumer_demo_2',
      rating: 4,
      body: 'حجم خوب، کمی شور بود.',
    });
    void this.reviews.createReview({
      vendorProfileId: 'vp_food_2',
      consumerId: 'consumer_demo_1',
      rating: 5,
      body: 'نان تازه و گرم.',
    });
  }
}

export interface MemoryVendorRow {
  id: string;
  vendorProfileId: string;
  businessName: string;
  vendorType: string;
  categoryTags: string[];
  description: string | null;
  verificationStatus: string;
  isHomeBased: boolean;
  lat: number;
  lng: number;
  address: string | null;
  serviceRadiusKm: number;
}

export function demoVendors(): MemoryVendorRow[] {
  return [
    {
      id: 'demo_food_1',
      vendorProfileId: 'vp_food_1',
      businessName: 'آشپزخانه مادر',
      vendorType: 'FOOD',
      categoryTags: ['home-chef', 'ghorme'],
      description: 'غذای خانگی ایرانی',
      verificationStatus: 'VERIFIED',
      isHomeBased: true,
      lat: 35.692,
      lng: 51.392,
      address: 'منطقه ۶ — محدوده',
      serviceRadiusKm: 4,
    },
    {
      id: 'demo_food_2',
      vendorProfileId: 'vp_food_2',
      businessName: 'نانوایی نزدیک',
      vendorType: 'FOOD',
      categoryTags: ['bakery', 'sangak'],
      description: 'نان تازه',
      verificationStatus: 'VERIFIED',
      isHomeBased: false,
      lat: 35.6865,
      lng: 51.385,
      address: 'خیابان ولیعصر',
      serviceRadiusKm: 2,
    },
    {
      id: 'demo_medical_1',
      vendorProfileId: 'vp_medical_1',
      businessName: 'مطب دکتر رضایی',
      vendorType: 'MEDICAL',
      categoryTags: ['general', 'visit'],
      description: 'ویزیت عمومی',
      verificationStatus: 'VERIFIED',
      isHomeBased: false,
      lat: 35.705,
      lng: 51.41,
      address: 'میدان ونک',
      serviceRadiusKm: 10,
    },
    {
      id: 'demo_beauty_1',
      vendorProfileId: 'vp_beauty_1',
      businessName: 'سالن نیلوفر',
      vendorType: 'BEAUTY',
      categoryTags: ['salon', 'hair'],
      description: 'آرایشگاه زنانه',
      verificationStatus: 'VERIFIED',
      isHomeBased: false,
      lat: 35.72,
      lng: 51.375,
      address: 'سعادت‌آباد',
      serviceRadiusKm: 5,
    },
    {
      id: 'demo_field_1',
      vendorProfileId: 'vp_field_1',
      businessName: 'تعمیرکار موبایل علی',
      vendorType: 'FIELD_SERVICE',
      categoryTags: ['mobile', 'repair'],
      description: 'سرویس در محل',
      verificationStatus: 'VERIFIED',
      isHomeBased: true,
      lat: 35.67,
      lng: 51.42,
      address: 'محدوده شرق تهران',
      serviceRadiusKm: 8,
    },
    {
      id: 'demo_ecom_1',
      vendorProfileId: 'vp_ecom_1',
      businessName: 'بوتیک سپید',
      vendorType: 'ECOMMERCE',
      categoryTags: ['clothing'],
      description: 'پوشاک',
      verificationStatus: 'VERIFIED',
      isHomeBased: false,
      lat: 35.735,
      lng: 51.39,
      address: 'تجریش',
      serviceRadiusKm: 3,
    },
    {
      id: 'demo_food_3',
      vendorProfileId: 'vp_food_3',
      businessName: 'کبابی شب‌های نزدیک',
      vendorType: 'FOOD',
      categoryTags: ['kebab'],
      description: 'کباب و چلو',
      verificationStatus: 'VERIFIED',
      isHomeBased: false,
      lat: 35.68,
      lng: 51.36,
      address: 'آرژانتین',
      serviceRadiusKm: 5,
    },
    {
      id: 'demo_food_4',
      vendorProfileId: 'vp_food_4',
      businessName: 'شیرینی‌پزی خانگی مریم',
      vendorType: 'FOOD',
      categoryTags: ['pastry', 'home'],
      description: 'شیرینی خانگی',
      verificationStatus: 'VERIFIED',
      isHomeBased: true,
      lat: 35.71,
      lng: 51.4,
      address: 'محدوده پاسداران',
      serviceRadiusKm: 6,
    },
  ];
}
