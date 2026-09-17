import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { ERROR_CODES, sanitizeRichTextSafe } from '../common/text';
import type { VendorType } from '@nazdik/shared';

export interface FeedPost {
  id: string;
  caption: string;
  createdAt: string;
  images: Array<{ id: string; url: string; altText: string | null; mediaId: string }>;
  productTags: Array<{
    productId: string;
    title: string;
    priceToman: number;
    currency: string;
  }>;
}

export interface VendorPublicProfile {
  id: string;
  businessName: string;
  vendorType: VendorType | string;
  categoryTags: string[];
  description: string | null;
  verificationStatus: string;
  isHomeBased: boolean;
  socialLinks: Record<string, string>;
  location: {
    displayLat: number;
    displayLng: number;
    address: string | null;
    isHomeBased: boolean;
  } | null;
  posts: FeedPost[];
  products: Array<{
    id: string;
    title: string;
    description: string | null;
    priceToman: number;
    currency: string;
    stock: number | null;
  }>;
  reviewSummary: {
    count: number;
    average: number;
  };
}

/** In-memory feed store for offline/dev/tests */
interface MemoryPost extends FeedPost {
  vendorProfileId: string;
  isPublished: boolean;
}
interface MemoryProduct {
  id: string;
  vendorProfileId: string;
  title: string;
  description: string | null;
  priceToman: number;
  currency: string;
  stock: number | null;
  isActive: boolean;
}

@Injectable()
export class FeedService {
  private posts = new Map<string, MemoryPost>();
  private products = new Map<string, MemoryProduct>();
  private profiles = new Map<
    string,
    {
      id: string;
      businessName: string;
      vendorType: string;
      categoryTags: string[];
      description: string | null;
      verificationStatus: string;
      isHomeBased: boolean;
      socialLinks: Record<string, string>;
      address: string | null;
      displayLat: number;
      displayLng: number;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  clearMemory(): void {
    this.posts.clear();
    this.products.clear();
    this.profiles.clear();
  }

  seedProfile(p: {
    id: string;
    businessName: string;
    vendorType: string;
    categoryTags?: string[];
    description?: string | null;
    verificationStatus?: string;
    isHomeBased?: boolean;
    socialLinks?: Record<string, string>;
    address?: string | null;
    displayLat?: number;
    displayLng?: number;
  }): void {
    this.profiles.set(p.id, {
      id: p.id,
      businessName: p.businessName,
      vendorType: p.vendorType,
      categoryTags: p.categoryTags ?? [],
      description: p.description ?? null,
      verificationStatus: p.verificationStatus ?? 'VERIFIED',
      isHomeBased: p.isHomeBased ?? false,
      socialLinks: p.socialLinks ?? {},
      address: p.address ?? null,
      displayLat: p.displayLat ?? 35.6892,
      displayLng: p.displayLng ?? 51.389,
    });
  }

  private postSeq = 0;

  createPost(input: {
    vendorProfileId: string;
    caption: string;
    imageUrls?: string[];
    productTags?: Array<{ productId: string; title: string; priceToman: number; currency?: string }>;
  }): FeedPost {
    this.postSeq += 1;
    const id = `post_${this.postSeq}_${Date.now().toString(36)}`;
    // Monotonic createdAt so newest-first sort is stable in the same millisecond
    const createdAt = new Date(Date.now() + this.postSeq).toISOString();
    const post: MemoryPost = {
      id,
      vendorProfileId: input.vendorProfileId,
      caption: sanitizeRichTextSafe(input.caption, 2000),
      createdAt,
      isPublished: true,
      images: (input.imageUrls ?? []).map((url, i) => ({
        id: `${id}_img_${i}`,
        url,
        altText: null,
        mediaId: `mem_${i}`,
      })),
      productTags: (input.productTags ?? []).map((t) => ({
        productId: t.productId,
        title: t.title,
        priceToman: t.priceToman,
        currency: t.currency ?? 'IRR',
      })),
    };
    this.posts.set(id, post);
    return post;
  }

  createProduct(input: {
    vendorProfileId: string;
    title: string;
    description?: string;
    priceToman: number;
    currency?: string;
    stock?: number | null;
  }): MemoryProduct {
    const id = `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const product: MemoryProduct = {
      id,
      vendorProfileId: input.vendorProfileId,
      title: sanitizeRichTextSafe(input.title, 120),
      description: input.description
        ? sanitizeRichTextSafe(input.description, 1000)
        : null,
      priceToman: Math.max(0, Math.floor(input.priceToman)),
      currency: input.currency ?? 'IRR',
      stock: input.stock ?? null,
      isActive: true,
    };
    this.products.set(id, product);
    return product;
  }

  getVendorProfile(vendorProfileId: string, reviewAvg?: { count: number; average: number }): VendorPublicProfile {
    const profile = this.profiles.get(vendorProfileId);
    if (!profile) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Vendor profile not found',
      });
    }

    const posts = Array.from(this.posts.values())
      .filter((p) => p.vendorProfileId === vendorProfileId && p.isPublished)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ vendorProfileId: _v, isPublished: _p, ...rest }) => rest);

    const products = Array.from(this.products.values())
      .filter((p) => p.vendorProfileId === vendorProfileId && p.isActive)
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        priceToman: p.priceToman,
        currency: p.currency,
        stock: p.stock,
      }));

    return {
      id: profile.id,
      businessName: profile.businessName,
      vendorType: profile.vendorType,
      categoryTags: profile.categoryTags,
      description: profile.description,
      verificationStatus: profile.verificationStatus,
      isHomeBased: profile.isHomeBased,
      socialLinks: profile.socialLinks,
      location: {
        displayLat: profile.displayLat,
        displayLng: profile.displayLng,
        address: profile.address,
        isHomeBased: profile.isHomeBased,
      },
      posts,
      products,
      reviewSummary: reviewAvg ?? { count: 0, average: 0 },
    };
  }

  listFeed(limit = 20): Array<MemoryPost & { businessName: string }> {
    return Array.from(this.posts.values())
      .filter((p) => p.isPublished)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((p) => ({
        ...p,
        businessName: this.profiles.get(p.vendorProfileId)?.businessName ?? 'فروشنده',
      }));
  }

  async tryLoadProfileFromDb(vendorProfileId: string): Promise<void> {
    try {
      const vp = await this.prisma.vendorProfile.findUnique({
        where: { id: vendorProfileId },
        include: { locations: true },
      });
      if (!vp) return;
      const loc = vp.locations?.[0];
      this.seedProfile({
        id: vp.id,
        businessName: vp.businessName,
        vendorType: vp.vendorType,
        categoryTags: vp.categoryTags,
        description: vp.description,
        verificationStatus: vp.verificationStatus,
        isHomeBased: vp.isHomeBased,
        socialLinks: (vp.socialLinks ?? {}) as Record<string, string>,
        address: loc?.address ?? null,
        displayLat: loc?.lat ?? 35.6892,
        displayLng: loc?.lng ?? 51.389,
      });
    } catch {
      /* memory only */
    }
  }
}

export function requireVendorOwnership(profileUserId: string, user: { id: string; role: string }): void {
  if (user.role === 'ADMIN') return;
  if (profileUserId !== user.id) {
    throw new ForbiddenException({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Not your vendor profile',
    });
  }
}
