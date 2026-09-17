import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_CODES } from '../common/text';

export interface ReviewRecord {
  id: string;
  vendorProfileId: string;
  consumerId: string;
  rating: number;
  body: string | null;
  isVisible: boolean;
  createdAt: string;
  reply: { id: string; body: string; createdAt: string } | null;
  consumerLabel: string;
}

/**
 * Reviews are purchase/appointment gated.
 * Phase 3 uses CompletedEngagement as the gate; Phase 4 order engine will
 * write the same table when orders/appointments complete.
 */
@Injectable()
export class ReviewsService {
  private reviews = new Map<string, ReviewRecord>();
  private engagements = new Set<string>(); // `${vendorProfileId}:${consumerId}`
  private byKey = new Map<string, string>(); // vendor:consumer -> reviewId

  constructor(private readonly prisma: PrismaService) {}

  clearMemory(): void {
    this.reviews.clear();
    this.engagements.clear();
    this.byKey.clear();
  }

  /** Mark consumer as having a completed order/appointment (unlocks review) */
  grantEngagement(vendorProfileId: string, consumerId: string): void {
    this.engagements.add(this.key(vendorProfileId, consumerId));
  }

  hasEngagement(vendorProfileId: string, consumerId: string): boolean {
    return this.engagements.has(this.key(vendorProfileId, consumerId));
  }

  async canReview(vendorProfileId: string, consumerId: string): Promise<boolean> {
    if (this.hasEngagement(vendorProfileId, consumerId)) return true;
    try {
      const row = await this.prisma.completedEngagement?.findFirst?.({
        where: { vendorProfileId, consumerId },
      });
      return Boolean(row);
    } catch {
      return false;
    }
  }

  async createReview(input: {
    vendorProfileId: string;
    consumerId: string;
    rating: number;
    body?: string;
  }): Promise<ReviewRecord> {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'rating must be an integer 1–5',
      });
    }

    const allowed = await this.canReview(input.vendorProfileId, input.consumerId);
    if (!allowed) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only customers with a completed order or appointment can review',
        details: { reason: 'NO_COMPLETED_ENGAGEMENT' },
      });
    }

    const k = this.key(input.vendorProfileId, input.consumerId);
    const existingId = this.byKey.get(k);
    if (existingId) {
      const existing = this.reviews.get(existingId)!;
      existing.rating = rating;
      existing.body = input.body != null ? String(input.body).slice(0, 2000) : existing.body;
      return existing;
    }

    const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ReviewRecord = {
      id,
      vendorProfileId: input.vendorProfileId,
      consumerId: input.consumerId,
      rating,
      body: input.body != null ? String(input.body).slice(0, 2000) : null,
      isVisible: true,
      createdAt: new Date().toISOString(),
      reply: null,
      consumerLabel: maskPhone(input.consumerId),
    };
    this.reviews.set(id, record);
    this.byKey.set(k, id);
    return record;
  }

  replyToReview(input: {
    reviewId: string;
    vendorProfileId: string;
    vendorUserId: string;
    body: string;
  }): ReviewRecord {
    const review = this.reviews.get(input.reviewId);
    if (!review) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Review not found' });
    }
    if (review.vendorProfileId !== input.vendorProfileId) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Review belongs to another vendor',
      });
    }
    review.reply = {
      id: `reply_${Date.now().toString(36)}`,
      body: String(input.body).slice(0, 1000),
      createdAt: new Date().toISOString(),
    };
    return review;
  }

  listForVendor(vendorProfileId: string): ReviewRecord[] {
    return Array.from(this.reviews.values())
      .filter((r) => r.vendorProfileId === vendorProfileId && r.isVisible)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  summaryForVendor(vendorProfileId: string): { count: number; average: number } {
    const list = this.listForVendor(vendorProfileId);
    if (list.length === 0) return { count: 0, average: 0 };
    const sum = list.reduce((a, r) => a + r.rating, 0);
    return {
      count: list.length,
      average: Math.round((sum / list.length) * 10) / 10,
    };
  }

  private key(vendorProfileId: string, consumerId: string): string {
    return `${vendorProfileId}:${consumerId}`;
  }
}

function maskPhone(id: string): string {
  if (/^09\d{9}$/.test(id)) return `${id.slice(0, 4)} *** ${id.slice(7)}`;
  return 'مشتری';
}
