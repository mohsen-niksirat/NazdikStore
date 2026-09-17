import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeSlotService } from './time-slot.service';
import { ReviewsService } from '../reviews/reviews.service';
import {
  ORDER_KINDS,
  ORDER_STATUSES,
  assertTransition,
  initialStatusForKind,
  unlocksReview,
  type OrderKind,
  type OrderStatus,
} from './order-state';
import { ERROR_CODES } from '../common/text';

export interface OrderLineInput {
  productId?: string;
  title: string;
  unitPriceToman: number;
  quantity?: number;
  variation?: string;
}

export interface OrderRecord {
  id: string;
  kind: OrderKind;
  status: OrderStatus;
  vendorProfileId: string;
  consumerId: string;
  totalToman: number;
  note: string | null;
  deliveryAddress: string | null;
  lines: Array<{
    id: string;
    productId: string | null;
    title: string;
    unitPriceToman: number;
    quantity: number;
    variation: string | null;
  }>;
  slotId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  productId: string;
  vendorProfileId: string;
  title: string;
  priceToman: number;
  stock: number | null; // null = unlimited
  variations?: Array<{ id: string; label: string; priceToman: number }>;
  leadTimeMinutes?: number;
}

@Injectable()
export class OrdersService {
  private orders = new Map<string, OrderRecord>();
  private inventory = new Map<string, InventoryItem>();
  /** delivery zones: vendorProfileId -> list of allowed area codes / simple polygon checks */
  private deliveryZones = new Map<string, { maxRadiusKm: number; lat: number; lng: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: TimeSlotService,
    private readonly reviews: ReviewsService,
  ) {}

  clearMemory(): void {
    this.orders.clear();
    this.inventory.clear();
    this.deliveryZones.clear();
    this.slots.clearMemory();
  }

  seedInventory(item: InventoryItem): void {
    this.inventory.set(item.productId, item);
  }

  setDeliveryZone(vendorProfileId: string, zone: { maxRadiusKm: number; lat: number; lng: number }): void {
    this.deliveryZones.set(vendorProfileId, zone);
  }

  get(id: string): OrderRecord {
    const o = this.orders.get(id);
    if (!o) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Order not found' });
    }
    return o;
  }

  listForConsumer(consumerId: string): OrderRecord[] {
    return Array.from(this.orders.values())
      .filter((o) => o.consumerId === consumerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listForVendor(vendorProfileId: string): OrderRecord[] {
    return Array.from(this.orders.values())
      .filter((o) => o.vendorProfileId === vendorProfileId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Delivery / RFQ order (cart checkout) */
  async createDeliveryOrder(input: {
    consumerId: string;
    vendorProfileId: string;
    lines: OrderLineInput[];
    deliveryAddress?: string;
    note?: string;
    deliveryLat?: number;
    deliveryLng?: number;
  }): Promise<OrderRecord> {
    if (!input.lines?.length) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Cart is empty',
      });
    }

    // Inventory + delivery zone validation
    let total = 0;
    const lines: OrderRecord['lines'] = [];
    for (const line of input.lines) {
      const qty = Math.max(1, Math.floor(line.quantity ?? 1));
      const item = line.productId ? this.inventory.get(line.productId) : null;
      if (item) {
        if (item.vendorProfileId !== input.vendorProfileId) {
          throw new BadRequestException({
            code: ERROR_CODES.VALIDATION_FAILED,
            message: 'Cart mixes multiple vendors',
          });
        }
        if (item.stock != null && item.stock < qty) {
          throw new ConflictException({
            code: ERROR_CODES.CONFLICT,
            message: 'Insufficient stock',
            details: { productId: item.productId, available: item.stock },
          });
        }
        if (item.variations?.length && line.variation) {
          const v = item.variations.find((x) => x.id === line.variation || x.label === line.variation);
          if (!v) {
            throw new BadRequestException({
              code: ERROR_CODES.VALIDATION_FAILED,
              message: 'Unknown variation',
            });
          }
        }
      }
      const unit = line.unitPriceToman;
      total += unit * qty;
      lines.push({
        id: `ol_${lines.length + 1}_${Date.now().toString(36)}`,
        productId: line.productId ?? null,
        title: line.title,
        unitPriceToman: unit,
        quantity: qty,
        variation: line.variation ?? null,
      });
    }

    const zone = this.deliveryZones.get(input.vendorProfileId);
    if (zone && input.deliveryLat != null && input.deliveryLng != null) {
      const dLat = Math.abs(input.deliveryLat - zone.lat);
      const dLng = Math.abs(input.deliveryLng - zone.lng);
      const roughKm = Math.hypot(dLat * 111.32, dLng * 111.32 * Math.cos((zone.lat * Math.PI) / 180));
      if (roughKm > zone.maxRadiusKm) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Delivery address outside vendor zone',
          details: { maxRadiusKm: zone.maxRadiusKm, roughKm: Math.round(roughKm) },
        });
      }
    }

    // decrement stock
    for (const line of input.lines) {
      const item = line.productId ? this.inventory.get(line.productId) : null;
      if (item?.stock != null) {
        item.stock -= Math.max(1, Math.floor(line.quantity ?? 1));
      }
    }

    return this.persistOrder({
      kind: 'DELIVERY',
      vendorProfileId: input.vendorProfileId,
      consumerId: input.consumerId,
      totalToman: total,
      lines,
      note: input.note ?? null,
      deliveryAddress: input.deliveryAddress ?? null,
      status: 'PENDING_ACCEPTANCE',
      meta: {},
      slotId: null,
    });
  }

  /** Appointment booking — atomic slot claim */
  async createAppointmentOrder(input: {
    consumerId: string;
    vendorProfileId: string;
    slotId: string;
    note?: string;
    priceToman?: number;
  }): Promise<OrderRecord> {
    const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Atomic slot first — 409 if taken
    const slot = await this.slots.bookSlotAtomic({
      slotId: input.slotId,
      orderId,
      vendorProfileId: input.vendorProfileId,
      consumerId: input.consumerId,
    });

    const order = this.persistOrder({
      id: orderId,
      kind: 'APPOINTMENT',
      vendorProfileId: input.vendorProfileId,
      consumerId: input.consumerId,
      totalToman: input.priceToman ?? 0,
      lines: [
        {
          id: `${orderId}_l1`,
          productId: null,
          title: `نوبت ${slot.day}`,
          unitPriceToman: input.priceToman ?? 0,
          quantity: 1,
          variation: null,
        },
      ],
      note: input.note ?? null,
      deliveryAddress: null,
      status: 'SCHEDULED',
      meta: { slotId: slot.id, day: slot.day, startMinute: slot.startMinute },
      slotId: slot.id,
    });
    return order;
  }

  /** Create order from accepted RFQ quote */
  createRfqOrder(input: {
    consumerId: string;
    vendorProfileId: string;
    jobRequestId: string;
    quoteId: string;
    priceToman: number;
    description: string;
  }): OrderRecord {
    return this.persistOrder({
      kind: 'RFQ',
      vendorProfileId: input.vendorProfileId,
      consumerId: input.consumerId,
      totalToman: input.priceToman,
      lines: [
        {
          id: `rfq_${input.quoteId}`,
          productId: null,
          title: input.description,
          unitPriceToman: input.priceToman,
          quantity: 1,
          variation: null,
        },
      ],
      note: null,
      deliveryAddress: null,
      status: 'PREPARING',
      meta: { jobRequestId: input.jobRequestId, quoteId: input.quoteId },
      slotId: null,
    });
  }

  /** State machine transition */
  async transition(
    orderId: string,
    to: OrderStatus,
    actor: { id: string; role: string },
  ): Promise<OrderRecord> {
    const order = this.get(orderId);

    // RBAC-ish: vendor or admin or consumer (cancel only)
    const isVendor = actor.role === 'ADMIN' || actor.id === order.vendorProfileId || actor.role === 'VENDOR';
    const isConsumer = actor.id === order.consumerId;
    if (!isVendor && !isConsumer) {
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Not a party to this order',
      });
    }
    if (to === 'CANCELLED' && !isVendor && !isConsumer) {
      throw new BadRequestException({ code: ERROR_CODES.FORBIDDEN, message: 'Cannot cancel' });
    }

    try {
      assertTransition(order.status, to);
    } catch (err) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${order.status} to ${to}`,
        details: { from: order.status, to },
      });
    }

    const prev = order.status;
    order.status = to;
    order.updatedAt = new Date().toISOString();

    if (to === 'CANCELLED' && order.slotId) {
      this.slots.releaseSlot(order.slotId);
    }

    if (unlocksReview(to)) {
      // Grant Phase 3 review rights
      this.reviews.grantEngagement(order.vendorProfileId, order.consumerId);
      order.meta = { ...order.meta, engagementGranted: true, completedFrom: prev };
    }

    return order;
  }

  private persistOrder(input: {
    id?: string;
    kind: OrderKind;
    vendorProfileId: string;
    consumerId: string;
    totalToman: number;
    lines: OrderRecord['lines'];
    note: string | null;
    deliveryAddress: string | null;
    status: OrderStatus;
    meta: Record<string, unknown>;
    slotId: string | null;
  }): OrderRecord {
    const id = input.id ?? `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const record: OrderRecord = {
      id,
      kind: input.kind,
      status: input.status,
      vendorProfileId: input.vendorProfileId,
      consumerId: input.consumerId,
      totalToman: input.totalToman,
      note: input.note,
      deliveryAddress: input.deliveryAddress,
      lines: input.lines,
      slotId: input.slotId,
      meta: input.meta,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(id, record);
    return record;
  }
}

export function isValidOrderKind(v: string): v is OrderKind {
  return (ORDER_KINDS as readonly string[]).includes(v);
}

export function isValidOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}

export { initialStatusForKind };
