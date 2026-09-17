import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MapService } from '../map/map.service';
import { OrdersService } from './orders.service';
import { ERROR_CODES } from '../common/text';
import { haversineMeters } from '@nazdik/shared';

export interface JobRequestRecord {
  id: string;
  consumerId: string;
  title: string;
  description: string;
  mediaIds: string[];
  radiusKm: number;
  lat: number | null;
  lng: number | null;
  budgetMaxToman: number | null;
  status: 'OPEN' | 'LOCKED' | 'CANCELLED' | 'EXPIRED';
  lockedQuoteId: string | null;
  vendorProfileId: string | null;
  createdAt: string;
}

export interface JobQuoteRecord {
  id: string;
  jobRequestId: string;
  vendorProfileId: string;
  priceToman: number;
  etaHours: number;
  message: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: string;
}

/**
 * RFQ / reverse-bidding engine.
 * Customer posts a job → nearby vendors quote → customer locks one bid → RFQ order.
 */
@Injectable()
export class RfqService {
  private jobs = new Map<string, JobRequestRecord>();
  private quotes = new Map<string, JobQuoteRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly map: MapService,
    private readonly orders: OrdersService,
  ) {}

  clearMemory(): void {
    this.jobs.clear();
    this.quotes.clear();
  }

  createJobRequest(input: {
    consumerId: string;
    title: string;
    description: string;
    mediaIds?: string[];
    radiusKm?: number;
    lat?: number;
    lng?: number;
    budgetMaxToman?: number;
  }): { job: JobRequestRecord; broadcastVendorIds: string[] } {
    if (!input.title?.trim() || !input.description?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'title and description required',
      });
    }
    const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const job: JobRequestRecord = {
      id,
      consumerId: input.consumerId,
      title: input.title.slice(0, 120),
      description: input.description.slice(0, 2000),
      mediaIds: input.mediaIds ?? [],
      radiusKm: input.radiusKm ?? 5,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      budgetMaxToman: input.budgetMaxToman ?? null,
      status: 'OPEN',
      lockedQuoteId: null,
      vendorProfileId: null,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);

    const broadcast = this.broadcastTargets(job);
    return { job, broadcastVendorIds: broadcast };
  }

  /** Nearby FIELD_SERVICE / MEDICAL vendors within radius */
  broadcastTargets(job: JobRequestRecord): string[] {
    if (job.lat == null || job.lng == null) {
      return ['vp_field_1'];
    }
    const center = { lat: job.lat, lng: job.lng };
    const rows = this.map.getMemoryLocations();
    const targets = rows
      .filter(
        (r) =>
          r.verificationStatus === 'VERIFIED' &&
          (r.vendorType === 'FIELD_SERVICE' || r.vendorType === 'MEDICAL'),
      )
      .filter((r) => haversineMeters(center, { lat: r.lat, lng: r.lng }) <= job.radiusKm * 1000)
      .map((r) => r.vendorProfileId);
    return targets.length ? targets : ['vp_field_1'];
  }

  submitQuote(input: {
    jobRequestId: string;
    vendorProfileId: string;
    priceToman: number;
    etaHours: number;
    message?: string;
  }): JobQuoteRecord {
    const job = this.jobs.get(input.jobRequestId);
    if (!job) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Job request not found' });
    }
    if (job.status !== 'OPEN') {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Job request is not open',
        details: { status: job.status },
      });
    }
    if (input.priceToman < 0 || input.etaHours < 0) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'price and eta must be non-negative',
      });
    }

    const existingKey = Array.from(this.quotes.values()).find(
      (q) => q.jobRequestId === input.jobRequestId && q.vendorProfileId === input.vendorProfileId,
    );
    if (existingKey && existingKey.status !== 'WITHDRAWN') {
      // upsert
      existingKey.priceToman = input.priceToman;
      existingKey.etaHours = input.etaHours;
      existingKey.message = input.message ?? existingKey.message;
      return existingKey;
    }

    const quote: JobQuoteRecord = {
      id: `quote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      jobRequestId: input.jobRequestId,
      vendorProfileId: input.vendorProfileId,
      priceToman: input.priceToman,
      etaHours: input.etaHours,
      message: input.message ?? null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.quotes.set(quote.id, quote);
    return quote;
  }

  listQuotes(jobRequestId: string, viewer: { id: string; role: string }): JobQuoteRecord[] {
    const job = this.jobs.get(jobRequestId);
    if (!job) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Job request not found' });
    }
    const all = Array.from(this.quotes.values()).filter((q) => q.jobRequestId === jobRequestId);
    if (viewer.role === 'ADMIN' || viewer.id === job.consumerId) return all;
    return all.filter((q) => q.vendorProfileId === viewer.id);
  }

  /** Consumer locks a winning bid — exactly one; others rejected */
  acceptQuote(input: {
    jobRequestId: string;
    quoteId: string;
    consumerId: string;
}): { job: JobRequestRecord; quote: JobQuoteRecord; orderId: string } {
    const job = this.jobs.get(input.jobRequestId);
    if (!job) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Job request not found' });
    }
    if (job.consumerId !== input.consumerId) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the job owner can accept a quote',
      });
    }
    if (job.status !== 'OPEN') {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Job already locked or closed',
        details: { status: job.status, lockedQuoteId: job.lockedQuoteId },
      });
    }

    const quote = this.quotes.get(input.quoteId);
    if (!quote || quote.jobRequestId !== job.id) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Quote not found' });
    }
    if (quote.status !== 'PENDING') {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Quote is not pending',
      });
    }

    // Atomic lock
    job.status = 'LOCKED';
    job.lockedQuoteId = quote.id;
    job.vendorProfileId = quote.vendorProfileId;
    quote.status = 'ACCEPTED';

    for (const q of this.quotes.values()) {
      if (q.jobRequestId === job.id && q.id !== quote.id && q.status === 'PENDING') {
        q.status = 'REJECTED';
      }
    }

    const order = this.orders.createRfqOrder({
      consumerId: job.consumerId,
      vendorProfileId: quote.vendorProfileId,
      jobRequestId: job.id,
      quoteId: quote.id,
      priceToman: quote.priceToman,
      description: job.title,
    });

    return { job, quote, orderId: order.id };
  }

  getJob(id: string): JobRequestRecord {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Job request not found' });
    }
    return job;
  }

  listOpenJobsForVendor(vendorProfileId: string): JobRequestRecord[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === 'OPEN');
  }
}
